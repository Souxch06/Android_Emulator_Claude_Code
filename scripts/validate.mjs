// End-to-end validation: spawns the MCP server over stdio (like Claude Code does) and calls every tool
// against the REAL remote device. Usage: node scripts/validate.mjs <test.apk>
// Needs ANDROID_CLOUD_REPO + ANDROID_CLOUD_GH_TOKEN (or ANDROID_CLOUD_URL + ANDROID_CLOUD_TOKEN).
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const apk = process.argv[2];
if (!apk) throw new Error('usage: node scripts/validate.mjs <test.apk>');
const srv = spawn('node', [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', id = 0; const pending = {};
srv.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pending[m.id]?.(m); } });
const rpc = (method, params) => new Promise((res) => { pending[++id] = res; srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const log = [];
async function call(name, args = {}, expectError = false) {
  const t = Date.now(); const m = await rpc('tools/call', { name, arguments: args });
  const text = m.result.content.map((c) => c.type === 'text' ? c.text : `[${c.type} ${c.data.length} b64 chars]`).join(' ');
  const ok = !!m.result.isError === expectError;
  log.push({ tool: name, args, ok, ms: Date.now() - t, out: text.slice(0, 600) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${Date.now() - t} ms): ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
  return text;
}

await rpc('initialize', { protocolVersion: '2025-06-18' });
const list = await rpc('tools/list');
console.log(`tools/list: ${list.result.tools.length} tools`);
await call('android_status');
await call('android_start', {});
await call('android_status');
const inst = JSON.parse(await call('android_install_apk', { path: apk }));
const pkg = inst.package;
await call('android_logcat', { clear: true, lines: 5 });
await call('android_launch_app', { package: pkg });
await call('android_wait', { text_contains: '7', timeout_s: 30 });
await call('android_screenshot', { name: 'validate-launched' });
await call('android_inspect', {});
await call('android_tap', { text: '7' });
await call('android_tap', { text: '+' });
await call('android_tap', { text: '5' });
await call('android_tap', { text: '=' });
await call('android_inspect', { text: '12' });
await call('android_test', { name: 'calc-multiply', package: pkg, steps: [
  { do: 'launch' }, { do: 'wait', text: '6' }, { do: 'tap', text: 'C' },
  { do: 'tap', text: '6' }, { do: 'tap', desc: 'Multiply' }, { do: 'tap', text: '7' }, { do: 'tap', text: '=' },
  { do: 'assert_visible', text: '42' }, { do: 'screenshot' }, { do: 'assert_no_crash' }] });
await call('android_test', { name: 'expected-failure', package: pkg, steps: [{ do: 'assert_visible', text: 'NO_SUCH_TEXT', timeout_s: 2 }] });
await call('android_swipe', { direction: 'up' });
await call('android_press', { key: 'home' });
await call('android_launch_app', { package: 'com.android.settings' });
await call('android_wait', { text_contains: 'Search', timeout_s: 15 });
await call('android_tap', { text_contains: 'Search' });
await call('android_type', { value: 'display', submit: true });
await call('android_wait', { text_contains: 'Display', timeout_s: 15 });
await call('android_screenshot', { name: 'validate-typed' });
await call('android_press', { key: 'back' });
await call('android_wait', { text: 'ELEMENT_THAT_NEVER_EXISTS', timeout_s: 3 }, true); // timeout must be reported as error
await call('android_unknown_tool', {}, true); // unknown tool must error cleanly
// Crash detection: crash the app for real (am crash) through the agent, outside the MCP tools, then detect it.
const S = JSON.parse(readFileSync(join(homedir(), '.android-cloud', 'session.json'), 'utf8'));
await call('android_launch_app', { package: pkg });
await call('android_logcat', { lines: 1, clear: true });
await fetch(S.url + '/adb', { method: 'POST', headers: { Authorization: `Bearer ${S.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ args: ['shell', `am crash ${pkg}`] }) });
await new Promise((r) => setTimeout(r, 3000));
const cr = JSON.parse(await call('android_logcat', { crashes_only: true, package: pkg }));
log.push({ tool: 'crash-detection', ok: cr.crash_count >= 1, out: `crash_count=${cr.crash_count}` });
console.log(`${cr.crash_count >= 1 ? 'PASS' : 'FAIL'} crash detection: crash_count=${cr.crash_count}`);
await call('android_test', { name: 'crash-must-fail', package: pkg, clear_logs: false, steps: [{ do: 'assert_no_crash' }] }); // returns passed:false
await call('android_watch');
await call('android_stop');
await call('android_status');
mkdirSync('android-cloud-artifacts', { recursive: true });
writeFileSync('android-cloud-artifacts/validation-log.json', JSON.stringify(log, null, 2));
const failed = log.filter((l) => l.ok === false);
console.log(`\n${log.filter((l) => l.ok).length} passed, ${failed.length} failed`);
srv.kill(); process.exit(failed.length ? 1 : 0);
