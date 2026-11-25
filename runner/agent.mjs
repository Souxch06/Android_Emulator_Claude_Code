// Device agent: runs on the cloud runner next to the emulator and exposes adb over HTTP.
// Every route requires the random per-session token (Bearer header or ?t= for the watch page).
import http from 'node:http';
import { execFile } from 'node:child_process';
import { createWriteStream, writeFileSync, mkdtempSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const TOKEN = process.env.AGENT_TOKEN;
const PORT = Number(process.env.PORT || 8080);
const ADB = process.env.ADB || 'adb';
const AAPT = process.env.AAPT;
const STOP_FILE = process.env.STOP_FILE || '/tmp/android-cloud-stop';
if (!TOKEN || TOKEN.length < 32) throw new Error('AGENT_TOKEN (>=32 chars) required');

const run = (cmd, args, timeoutS = 60, encoding = 'utf8') =>
  new Promise((res) =>
    execFile(cmd, args, { timeout: timeoutS * 1000, maxBuffer: 64 << 20, encoding }, (e, stdout, stderr) =>
      res({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, stdout, stderr: String(stderr || '') + (e?.killed ? '\n[timeout]' : '') })));

const authed = (req, url) => {
  const got = Buffer.from((req.headers.authorization || '').replace(/^Bearer /, '') || url.searchParams.get('t') || '');
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
};

const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readJson = async (req) => { let s = ''; for await (const c of req) s += c; return JSON.parse(s || '{}'); };

const WATCH = `<!doctype html><meta name=viewport content="width=device-width"><title>Android Cloud - live</title>
<body style="margin:0;background:#111;color:#aaa;font:14px sans-serif;display:grid;place-items:center;min-height:100vh">
<img id=s alt="device screen" style="max-height:96vh;max-width:100vw"><div id=m>connecting...</div>
<script>const t=new URLSearchParams(location.search).get('t');
async function f(){try{const r=await fetch('/screenshot?t='+encodeURIComponent(t));if(r.ok){const o=s.src;s.src=URL.createObjectURL(await r.blob());if(o)URL.revokeObjectURL(o);m.textContent='live - '+new Date().toLocaleTimeString()}else m.textContent='error '+r.status}catch(e){m.textContent='disconnected'}setTimeout(f,700)}f()</script>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!authed(req, url)) return json(res, 401, { error: 'unauthorized' });
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /health': {
        const b = await run(ADB, ['shell', 'getprop', 'sys.boot_completed'], 10);
        return json(res, 200, { ok: true, boot_completed: b.stdout.trim() === '1' });
      }
      case 'GET /watch':
        res.writeHead(200, { 'content-type': 'text/html' }); return res.end(WATCH);
      case 'GET /screenshot': {
        const r = await run(ADB, ['exec-out', 'screencap', '-p'], 30, 'buffer');
        if (r.code) return json(res, 500, { error: r.stderr });
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); return res.end(r.stdout);
      }
      case 'POST /adb': {
        const { args, timeout = 60 } = await readJson(req);
        if (!Array.isArray(args)) return json(res, 400, { error: 'args must be an array' });
        return json(res, 200, await run(ADB, args.map(String), Math.min(Number(timeout) || 60, 600)));
      }
      case 'POST /install': {
        const file = join(mkdtempSync(join(tmpdir(), 'apk-')), 'app.apk');
        await pipeline(req, createWriteStream(file));
        const badging = AAPT ? await run(AAPT, ['dump', 'badging', file], 30) : { stdout: '' };
        const pkg = badging.stdout.match(/package: name='([^']+)'/)?.[1] || null;
        const activity = badging.stdout.match(/launchable-activity: name='([^']+)'/)?.[1] || null;
        const r = await run(ADB, ['install', '-r', '-t', '-g', file], 300);
        return json(res, 200, { ...r, package: pkg, launchable_activity: activity });
      }
      case 'POST /shutdown':
        writeFileSync(STOP_FILE, '1'); return json(res, 200, { ok: true });
      default: return json(res, 404, { error: 'not found' });
    }
  } catch (e) { json(res, 500, { error: String(e?.message || e) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`agent listening on ${PORT}`));
