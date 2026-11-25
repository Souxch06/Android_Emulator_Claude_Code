// Call one MCP tool through a fresh server process (stdio, like Claude Code). Each call restarts the server,
// so a successful sequence also proves reconnection from the saved session.
// Usage: node scripts/call.mjs <tool> '<json args>'
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const [tool, args = '{}'] = process.argv.slice(2);
const srv = spawn('node', [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
srv.stdout.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.id !== 2) continue;
    for (const c of m.result.content) {
      if (c.type === 'image') { writeFileSync(process.env.IMG_OUT || 'last-screenshot.png', Buffer.from(c.data, 'base64')); console.log(`[image ${c.data.length} b64 chars]`); }
      else console.log(c.text);
    }
    srv.kill(); process.exit(m.result.isError ? 1 : 0);
  }
});
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: JSON.parse(args) } }) + '\n');
