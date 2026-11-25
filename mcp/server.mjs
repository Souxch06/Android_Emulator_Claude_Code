#!/usr/bin/env node
// Android Cloud MCP server: zero dependencies, MCP JSON-RPC over stdio.
// Drives a remote Android emulator (GitHub Actions runner) through the device agent (runner/agent.mjs).
import { generateKeyPairSync, privateDecrypt, randomUUID, constants } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const env = process.env;
const STATE_DIR = join(homedir(), '.android-cloud');
const STATE_FILE = join(STATE_DIR, 'session.json');
const OUT_DIR = resolve(env.ANDROID_CLOUD_OUT || 'android-cloud-artifacts');
const WORKFLOW = env.ANDROID_CLOUD_WORKFLOW || 'android-cloud.yml';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let S = (() => { try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; } })();
const save = () => { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(S), { mode: 0o600 }); };
const clear = () => { S = null; rmSync(STATE_FILE, { force: true }); };

// ---------- GitHub (cloud provisioning) ----------
async function gh(path, opts = {}) {
  const tok = env.ANDROID_CLOUD_GH_TOKEN;
  if (!tok) throw new Error('ANDROID_CLOUD_GH_TOKEN is not set (see docs/CLOUD-SETUP.md).');
  let r;
  for (let i = 0; i < 4; i++) { // GitHub returns occasional 502/503: retry with backoff
    r = await fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'android-cloud-mcp', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
    if (r.ok || (r.status && r.status < 500)) break;
    await sleep(3000 * (i + 1));
  }
  if (!r.ok) throw new Error(`GitHub API ${r.status} on ${path}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

// Returns the first file of a zip archive (GitHub artifacts are zips).
export function unzipFirst(buf) {
  // Sizes come from the central directory: local headers may hold 0 (data descriptor, as upload-artifact writes).
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip');
  const cd = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), lh = buf.readUInt32LE(cd + 42);
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  if (method === 0) return buf.subarray(start, start + size);
  if (method === 8) return inflateRawSync(buf.subarray(start, start + size));
  throw new Error(`unsupported zip method ${method}`);
}

export const decryptSession = (b64, privateKey) => JSON.parse(privateDecrypt(
  { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(b64.trim(), 'base64')).toString());

async function provision({ api_level = 34, minutes = 60, timeout_s = 900 }) {
  const repo = env.ANDROID_CLOUD_REPO;
  if (!repo) throw new Error('ANDROID_CLOUD_REPO (owner/repo hosting the android-cloud workflow) is not set.');
  const ref = env.ANDROID_CLOUD_REF || (await (await gh(`/repos/${repo}`)).json()).default_branch;
  const session = randomUUID().slice(0, 8);
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  await gh(`/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({
    ref, inputs: { session, pubkey: Buffer.from(publicKey).toString('base64'), api_level: String(api_level), minutes: String(Math.min(minutes, 340)) } }) });
  const deadline = Date.now() + timeout_s * 1000;
  let run;
  while (!run) {
    if (Date.now() > deadline) throw new Error('Workflow run did not appear in time.');
    await sleep(4000);
    const { workflow_runs } = await (await gh(`/repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=20`)).json();
    run = workflow_runs.find((r) => r.display_title?.includes(session));
  }
  // shortcut: private key lives only in memory, so a provisioning interrupted by an MCP restart must be restarted.
  S = { repo, run_id: run.id, run_url: run.html_url, session, started_at: new Date().toISOString(), minutes }; save();
  while (Date.now() < deadline) {
    await sleep(8000);
    const { artifacts } = await (await gh(`/repos/${repo}/actions/runs/${run.id}/artifacts`)).json();
    const art = artifacts.find((a) => a.name === `session-${session}`);
    if (art) {
      const zip = Buffer.from(await (await gh(art.archive_download_url)).arrayBuffer());
      Object.assign(S, decryptSession(unzipFirst(zip).toString(), privateKey)); save();
      return;
    }
    const st = await (await gh(`/repos/${repo}/actions/runs/${run.id}`)).json();
    if (st.status === 'completed') throw new Error(`Device run ended early (${st.conclusion}). Logs: ${run.html_url}`);
  }
  throw new Error(`Device not ready after ${timeout_s}s. Run: ${run.html_url}`);
}

// ---------- Device agent ----------
async function agent(path, { method = 'GET', body, json, raw = false, timeout = 120 } = {}) {
  if (!S?.url) throw new Error('No device. Call android_start first.');
  let last;
  for (let i = 0; i < 4; i++) { // reconnect on transient tunnel errors
    try {
      const r = await fetch(S.url + path, { method, body: json ? JSON.stringify(json) : body, signal: AbortSignal.timeout(timeout * 1000),
        headers: { Authorization: `Bearer ${S.token}`, ...(json ? { 'content-type': 'application/json' } : {}) } });
      if (r.status > 500) throw new Error(`tunnel ${r.status}`); // 502/503/530 = tunnel hiccup, retry
      if (!r.ok) throw Object.assign(new Error(`agent ${r.status}: ${(await r.text()).slice(0, 500)}`), { fatal: true });
      return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
    } catch (e) { if (e.fatal) throw e; last = e; await sleep(1500 * (i + 1)); }
  }
  throw new Error(`Device unreachable (${last?.message}). The session may have ended: check android_status.`);
}
const adb = (args, timeout = 60) => agent('/adb', { method: 'POST', json: { args, timeout }, timeout: timeout + 20 });
const sh = async (cmd, timeout) => { const r = await adb(['shell', cmd], timeout); if (r.code) throw new Error(`shell failed (${r.code}): ${cmd}\n${r.stderr || r.stdout}`); return r.stdout; };
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

async function waitHealthy(timeout_s = 300) {
  const end = Date.now() + timeout_s * 1000;
  while (Date.now() < end) { try { if ((await agent('/health', { timeout: 15 })).boot_completed) return; } catch {} await sleep(3000); }
  throw new Error('Device did not become healthy.');
}

const ent = { '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#10;': '\n', '&amp;': '&' };
async function dumpUi() {
  let xml = '';
  for (let i = 0; i < 3 && !xml.includes('<hierarchy'); i++) xml = (await adb(['shell', 'uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; cat /sdcard/ui.xml'], 40)).stdout;
  if (!xml.includes('<hierarchy')) throw new Error('UI dump failed (screen may be animating or secure).');
  return [...xml.matchAll(/<node ([^>]*?)\/?>/g)].map((m) => {
    const a = Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v.replace(/&[#\w]+;/g, (e) => ent[e] ?? e)]));
    const [x1, y1, x2, y2] = (a.bounds?.match(/\d+/g) || [0, 0, 0, 0]).map(Number);
    return { text: a.text, id: a['resource-id'], desc: a['content-desc'], cls: a.class, pkg: a.package, clickable: a.clickable === 'true',
      enabled: a.enabled === 'true', checked: a.checked === 'true', focused: a.focused === 'true', bounds: [x1, y1, x2, y2], center: [(x1 + x2) >> 1, (y1 + y2) >> 1] };
  });
}

export function matches(n, s) {
  const lc = (v) => String(v || '').toLowerCase();
  if (s.text != null && n.text !== s.text && n.desc !== s.text) return false;
  if (s.text_contains != null && !lc(n.text).includes(lc(s.text_contains)) && !lc(n.desc).includes(lc(s.text_contains))) return false;
  if (s.id != null && n.id !== s.id && !n.id?.endsWith(`:id/${s.id}`)) return false;
  if (s.desc != null && n.desc !== s.desc) return false;
  return s.text != null || s.text_contains != null || s.id != null || s.desc != null;
}
const find = async (sel) => (await dumpUi()).filter((n) => matches(n, sel));
const focus = async () => (await adb(['shell', 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"'])).stdout.trim();

async function waitFor(sel, { timeout_s = 20, gone = false } = {}) {
  const end = Date.now() + timeout_s * 1000;
  do {
    if (sel.activity) { if ((await focus()).includes(sel.activity) !== gone) return true; }
    else if (((await find(sel)).length > 0) !== gone) return true;
    await sleep(1000);
  } while (Date.now() < end);
  return false;
}

async function screenSize() { const m = (await sh('wm size')).match(/(\d+)x(\d+)\s*$/m); return m ? [+m[1], +m[2]] : [1080, 2400]; }

async function crashes(pkg) {
  const crash = (await adb(['logcat', '-d', '-b', 'crash', '-v', 'time'])).stdout;
  const anr = (await adb(['logcat', '-d', '-v', 'time', '-s', 'ActivityManager:E'])).stdout.split('\n').filter((l) => /ANR in/.test(l));
  const keep = (t) => !pkg || t.includes(pkg);
  const blocks = crash.split(/(?=^.*FATAL EXCEPTION)/m).filter((b) => b.includes('FATAL EXCEPTION') && keep(b));
  return { crash_count: blocks.length, anr_count: anr.filter(keep).length, crashes: blocks.map((b) => b.slice(0, 4000)), anrs: anr.filter(keep) };
}

async function screenshot(name) {
  const png = await agent('/screenshot', { raw: true, timeout: 60 });
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${(name || 'screen').replace(/[^\w.-]/g, '_')}-${Date.now()}.png`);
  writeFileSync(file, png);
  return { png, file };
}

const KEYS = { back: 4, home: 3, enter: 66, menu: 82, app_switch: 187, recents: 187, power: 26, volume_up: 24, volume_down: 25, delete: 67, del: 67, tab: 61, search: 84, escape: 111, dpad_up: 19, dpad_down: 20, dpad_left: 21, dpad_right: 22 };

// ---------- Tools ----------
const sel = { text: { type: 'string', description: 'Exact text or content-desc' }, text_contains: { type: 'string', description: 'Case-insensitive substring of text/content-desc' },
  id: { type: 'string', description: 'resource-id, full ("pkg:id/x") or short ("x")' }, desc: { type: 'string', description: 'Exact content-desc' },
  index: { type: 'integer', description: 'Which match to use when several (default 0)' } };
const T = (description, properties = {}, required = []) => ({ description, inputSchema: { type: 'object', properties, required } });

export const tools = {
  android_start: [T('Start (or reuse) your own remote Android emulator in the cloud. Takes ~3-6 min on first boot.',
    { api_level: { type: 'integer', description: 'Android API level (default 34)' }, minutes: { type: 'integer', description: 'Max session length, <=340 (default 60)' } }),
  async (a) => {
    if (S?.url) { try { await waitHealthy(20); return `Device already running. Run: ${S.run_url || 'direct'}`; } catch { clear(); } }
    if (env.ANDROID_CLOUD_URL) { S = { url: env.ANDROID_CLOUD_URL.replace(/\/$/, ''), token: env.ANDROID_CLOUD_TOKEN, direct: true }; save(); }
    else await provision(a);
    await waitHealthy();
    const [w, h] = await screenSize();
    const ver = (await sh('getprop ro.build.version.release')).trim();
    return `Device ready: Android ${ver}, screen ${w}x${h}.${S.run_url ? ` Cloud run: ${S.run_url}` : ''}\nLive view: call android_watch.`;
  }],
  android_stop: [T('Stop the remote device and end the cloud session (frees runner minutes).'), async () => {
    if (!S) return 'No active session.';
    const notes = [];
    try { await agent('/shutdown', { method: 'POST', timeout: 20 }); notes.push('agent shutdown requested'); } catch (e) { notes.push(`agent: ${e.message}`); }
    if (S.run_id && env.ANDROID_CLOUD_GH_TOKEN) {
      await sleep(15000);
      const st = await (await gh(`/repos/${S.repo}/actions/runs/${S.run_id}`)).json();
      if (st.status !== 'completed') { await gh(`/repos/${S.repo}/actions/runs/${S.run_id}/cancel`, { method: 'POST' }).catch(() => {}); notes.push('run cancelled'); }
      else notes.push(`run ${st.conclusion}`);
    }
    clear();
    return `Session stopped (${notes.join('; ')}).`;
  }],
  android_status: [T('State of the remote device: connection, boot, foreground app, cloud run status.'), async () => {
    if (!S) return JSON.stringify({ state: 'stopped' });
    const out = { state: 'unknown', run_url: S.run_url, started_at: S.started_at };
    if (S.run_id && env.ANDROID_CLOUD_GH_TOKEN) { const st = await (await gh(`/repos/${S.repo}/actions/runs/${S.run_id}`)).json(); out.run_status = `${st.status}${st.conclusion ? `/${st.conclusion}` : ''}`; }
    if (S.url) {
      try { const h = await agent('/health', { timeout: 15 }); out.state = h.boot_completed ? 'ready' : 'booting'; out.focus = await focus(); }
      catch (e) { out.state = 'unreachable'; out.error = e.message; }
    } else out.state = 'provisioning';
    return JSON.stringify(out, null, 2);
  }],
  android_install_apk: [T('Upload a local APK to the remote device and install it (replaces existing, grants runtime permissions).',
    { path: { type: 'string', description: 'Local path to the .apk' } }, ['path']),
  async ({ path }) => {
    const r = await agent('/install', { method: 'POST', body: readFileSync(path), timeout: 400 });
    if (r.code || !/Success/.test(r.stdout)) throw new Error(`Install failed: ${r.stdout}${r.stderr}`);
    return JSON.stringify({ installed: true, package: r.package, launchable_activity: r.launchable_activity, output: r.stdout.trim() });
  }],
  android_launch_app: [T('Launch, stop or reset an app.',
    { package: { type: 'string' }, activity: { type: 'string', description: 'Optional activity (".Main" or full name)' },
      action: { type: 'string', enum: ['launch', 'stop', 'restart', 'clear_data', 'uninstall'], description: 'Default launch' } }, ['package']),
  async ({ package: p, activity, action = 'launch' }) => {
    if (action === 'stop' || action === 'restart') await sh(`am force-stop ${q(p)}`);
    if (action === 'clear_data') return (await sh(`pm clear ${q(p)}`)).trim();
    if (action === 'uninstall') return (await adb(['uninstall', p])).stdout.trim();
    if (action === 'stop') return `Stopped ${p}`;
    const out = activity ? await sh(`am start -W -n ${q(`${p}/${activity}`)}`) : await sh(`monkey -p ${q(p)} -c android.intent.category.LAUNCHER 1`);
    if (/Error|No activities found|aborted/i.test(out)) throw new Error(out);
    await sleep(1500);
    return `Launched ${p}. Focus: ${await focus()}`;
  }],
  android_screenshot: [T('Capture the device screen (returned as image and saved to a local PNG).', { name: { type: 'string', description: 'File name prefix' } }),
  async ({ name }) => { const { png, file } = await screenshot(name); return [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: `Saved: ${file}` }]; }],
  android_inspect: [T('Dump the current UI tree (uiautomator) as a compact list of elements with text, id, bounds and center coordinates.',
    { all: { type: 'boolean', description: 'Include non-interesting layout nodes (default false)' }, ...sel }),
  async (a) => {
    let nodes = await dumpUi();
    if (a.text || a.text_contains || a.id || a.desc) nodes = nodes.filter((n) => matches(n, a));
    else if (!a.all) nodes = nodes.filter((n) => n.text || n.desc || n.clickable || n.id?.includes(':id/'));
    return JSON.stringify({ focus: await focus(), count: nodes.length, nodes });
  }],
  android_tap: [T('Tap by selector (text/id/desc) or raw coordinates. Use long_press for long press.',
    { ...sel, x: { type: 'integer' }, y: { type: 'integer' }, long_press: { type: 'boolean' } }),
  async (a) => {
    let { x, y } = a, what = `(${x},${y})`;
    if (x == null || y == null) {
      const n = (await find(a))[a.index || 0];
      if (!n) throw new Error(`No element matches ${JSON.stringify(a)}. Use android_inspect.`);
      [x, y] = n.center; what = `"${n.text || n.desc || n.id}" at (${x},${y})`;
    }
    await sh(a.long_press ? `input swipe ${x} ${y} ${x} ${y} 800` : `input tap ${x} ${y}`);
    return `Tapped ${what}`;
  }],
  android_swipe: [T('Swipe/scroll. Either direction (up = finger moves up, reveals content below) or explicit coordinates.',
    { direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, x1: { type: 'integer' }, y1: { type: 'integer' }, x2: { type: 'integer' }, y2: { type: 'integer' },
      duration_ms: { type: 'integer', description: 'Default 300' } }),
  async (a) => {
    let { x1, y1, x2, y2 } = a;
    if (a.direction) {
      const [w, h] = await screenSize(), cx = w >> 1, cy = h >> 1, dx = Math.round(w * 0.35), dy = Math.round(h * 0.3);
      [x1, y1, x2, y2] = { up: [cx, cy + dy, cx, cy - dy], down: [cx, cy - dy, cx, cy + dy], left: [cx + dx, cy, cx - dx, cy], right: [cx - dx, cy, cx + dx, cy] }[a.direction];
    }
    if ([x1, y1, x2, y2].some((v) => v == null)) throw new Error('Give direction or x1,y1,x2,y2.');
    await sh(`input swipe ${x1} ${y1} ${x2} ${y2} ${a.duration_ms || 300}`);
    return `Swiped (${x1},${y1})->(${x2},${y2})`;
  }],
  android_type: [T('Type text into the focused field (optionally tap a field first by selector, clear it, press enter).',
    { value: { type: 'string' }, ...sel, clear: { type: 'boolean' }, submit: { type: 'boolean' } }, ['value']),
  async (a) => {
    if (a.text || a.text_contains || a.id || a.desc) await tools.android_tap[1](a);
    if (a.clear) await sh('input keyevent KEYCODE_MOVE_END ' + Array(60).fill('KEYCODE_DEL').join(' '));
    // `input text` uses %s for spaces; single-quoting protects shell metacharacters.
    for (const chunk of a.value.match(/[\s\S]{1,80}/g) || []) await sh(`input text ${q(chunk.replace(/%/g, '\\%').replace(/ /g, '%s'))}`);
    if (a.submit) await sh('input keyevent 66');
    return `Typed ${a.value.length} chars${a.submit ? ' + enter' : ''}`;
  }],
  android_press: [T(`Press an Android key: ${Object.keys(KEYS).join(', ')} or a numeric keycode.`, { key: { type: 'string' } }, ['key']),
  async ({ key }) => { const k = KEYS[String(key).toLowerCase()] ?? (/^\d+$/.test(key) ? key : null); if (k == null) throw new Error(`Unknown key ${key}`); await sh(`input keyevent ${k}`); return `Pressed ${key}`; }],
  android_logcat: [T('Read device logs. crashes_only returns detected crashes (FATAL EXCEPTION) and ANRs.',
    { lines: { type: 'integer', description: 'Tail N lines (default 200)' }, package: { type: 'string', description: 'Only this app (by pid, or filter crashes)' },
      grep: { type: 'string', description: 'Regex filter' }, level: { type: 'string', enum: ['V', 'D', 'I', 'W', 'E', 'F'] },
      crashes_only: { type: 'boolean' }, clear: { type: 'boolean', description: 'Clear logs after reading' } }),
  async (a) => {
    let out;
    if (a.crashes_only) out = JSON.stringify(await crashes(a.package), null, 2);
    else {
      const args = ['logcat', '-d', '-v', 'time', '-t', String(a.lines || 200)];
      if (a.package) { const pid = (await adb(['shell', `pidof ${q(a.package)}`])).stdout.trim().split(/\s+/)[0]; if (pid) args.push(`--pid=${pid}`); }
      if (a.level) args.push(`*:${a.level}`);
      out = (await adb(args)).stdout;
      if (a.grep) { const re = new RegExp(a.grep, 'i'); out = out.split('\n').filter((l) => re.test(l)).join('\n'); }
    }
    if (a.clear) await adb(['logcat', '-b', 'all', '-c']);
    return out || '(empty)';
  }],
  android_wait: [T('Wait until an element appears (or disappears with gone=true), or an activity is in focus.',
    { ...sel, activity: { type: 'string', description: 'Substring of focused activity' }, gone: { type: 'boolean' }, timeout_s: { type: 'integer', description: 'Default 20' } }),
  async (a) => { if (!(await waitFor(a, a))) throw new Error(`Timeout after ${a.timeout_s || 20}s waiting for ${JSON.stringify(a)}. Focus: ${await focus()}`); return 'Condition met'; }],
  android_test: [T('Run a sequence of steps and assertions; returns a pass/fail report with evidence (saved as JSON). Step = {do, ...args} where do is one of: ' +
    'launch, stop, tap, type, swipe, press, wait, assert_visible, assert_not_visible, assert_no_crash, screenshot, sleep. Args match the single tools (tap: selector or x,y; type: value; press: key; wait/assert_*: selector; sleep: ms).',
    { name: { type: 'string' }, package: { type: 'string', description: 'App under test (used by launch/stop/assert_no_crash)' },
      steps: { type: 'array', items: { type: 'object' } }, stop_on_failure: { type: 'boolean', description: 'Default true' }, clear_logs: { type: 'boolean', description: 'Clear logcat before (default true)' } }, ['steps']),
  async ({ name = 'test', package: pkg, steps, stop_on_failure = true, clear_logs = true }) => {
    if (clear_logs) await adb(['logcat', '-b', 'all', '-c']);
    const results = [], t0 = Date.now();
    for (const [i, st] of steps.entries()) {
      const s = { ...st, package: st.package || pkg }, r = { step: i + 1, do: s.do, ok: true };
      try {
        switch (s.do) {
          case 'launch': r.info = await tools.android_launch_app[1]({ package: s.package, activity: s.activity }); break;
          case 'stop': r.info = await tools.android_launch_app[1]({ package: s.package, action: 'stop' }); break;
          case 'tap': r.info = await tools.android_tap[1](s); break;
          case 'type': r.info = await tools.android_type[1](s); break;
          case 'swipe': r.info = await tools.android_swipe[1](s); break;
          case 'press': r.info = await tools.android_press[1](s); break;
          case 'wait': r.info = await tools.android_wait[1](s); break;
          case 'assert_visible': if (!(await waitFor(s, { timeout_s: s.timeout_s ?? 5 }))) throw new Error(`not visible: ${JSON.stringify(st)}`); break;
          case 'assert_not_visible': if (!(await waitFor(s, { timeout_s: s.timeout_s ?? 5, gone: true }))) throw new Error(`still visible: ${JSON.stringify(st)}`); break;
          case 'assert_no_crash': { const c = await crashes(s.package); if (c.crash_count || c.anr_count) { r.evidence = c; throw new Error(`${c.crash_count} crash(es), ${c.anr_count} ANR(s)`); } break; }
          case 'screenshot': r.screenshot = (await screenshot(`${name}-step${i + 1}`)).file; break;
          case 'sleep': await sleep(s.ms || 1000); break;
          default: throw new Error(`unknown step "${s.do}"`);
        }
      } catch (e) {
        r.ok = false; r.error = e.message;
        try { r.screenshot = (await screenshot(`${name}-step${i + 1}-FAIL`)).file; } catch {}
      }
      results.push(r);
      if (!r.ok && stop_on_failure) break;
    }
    const c = await crashes(pkg);
    const passed = results.every((r) => r.ok) && results.length === steps.length && !c.crash_count && !c.anr_count;
    const report = { name, passed, executed: results.length, total: steps.length, duration_s: Math.round((Date.now() - t0) / 1000),
      crash_count: c.crash_count, anr_count: c.anr_count, crashes: c.crashes, results };
    mkdirSync(OUT_DIR, { recursive: true });
    const file = join(OUT_DIR, `${name.replace(/[^\w.-]/g, '_')}-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    return JSON.stringify({ ...report, report_file: file }, null, 2);
  }],
  android_watch: [T('Get a private link to watch the remote device screen live in a browser (the link contains the session secret: do not share it).'),
  async () => { if (!S?.url) throw new Error('No device. Call android_start first.'); return `${S.url}/watch?t=${S.token}`; }],
};

// ---------- MCP stdio JSON-RPC ----------
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
async function handle({ id, method, params }) {
  if (id === undefined) return; // notifications
  try {
    let result;
    if (method === 'initialize') result = { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'android-cloud', version: '1.0.0' } };
    else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools: Object.entries(tools).map(([name, [d]]) => ({ name, ...d })) };
    else if (method === 'tools/call') {
      const t = tools[params.name];
      if (!t) throw new Error(`Unknown tool ${params.name}`);
      try {
        const out = await t[1](params.arguments || {});
        result = { content: typeof out === 'string' ? [{ type: 'text', text: out }] : out };
      } catch (e) { result = { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
    } else return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    send({ jsonrpc: '2.0', id, result });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let buf = '';
  process.stdin.setEncoding('utf8').on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { try { handle(JSON.parse(line)); } catch {} } }
  });
}
