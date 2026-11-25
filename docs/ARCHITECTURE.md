# Architecture

```
 Your PC (Windows)                      GitHub Actions (cloud, free)            
 ┌──────────────────────────┐          ┌──────────────────────────────────────┐
 │ Claude Code Desktop      │          │ ubuntu-latest runner (4 vCPU, KVM)   │
 │  └ plugin android-cloud  │ dispatch │  ├ Android emulator (API 34 x86_64)  │
 │     └ mcp/server.mjs ────┼─────────►│  ├ runner/agent.mjs  (HTTP → adb)    │
 │       (Node, 0 deps)     │ artifact │  └ cloudflared quick tunnel          │
 │                          │◄─────────┼─  (RSA-encrypted {url, token})      │
 │                          │  HTTPS   │                                      │
 │                          ├─────────►│ https://<random>.trycloudflare.com   │
 └──────────────────────────┘          └──────────────────────────────────────┘
          browser ── android_watch link (live screen) ──────────►
```

## Session lifecycle
1. `android_start`: the MCP server generates an ephemeral RSA-2048 key pair and a session id, then calls
   `POST /repos/{repo}/actions/workflows/android-cloud.yml/dispatches` with the public key.
2. The workflow enables KVM, installs the emulator + system image, boots an AVD (pixel_6, swiftshader GPU — no GPU needed),
   starts the agent with a random 256-bit token, opens a Cloudflare quick tunnel (no account), and uploads
   `{url, token}` **encrypted with the public key** as artifact `session-<id>`.
3. The MCP server finds the run (run-name contains the session id), downloads the artifact, decrypts it with the private key
   (which never leaves your PC's memory), and saves the session to `~/.android-cloud/session.json` (mode 600).
4. Every tool call = HTTPS request to the agent (`/adb`, `/screenshot`, `/install`, `/health`), Bearer token auth.
   Transient tunnel errors (502/503/530, network) are retried 4× with backoff (reconnection).
5. `android_stop`: agent `/shutdown` ends the keep-alive step; if needed the run is cancelled through the API.
   The run also ends by itself after `minutes` (default 60, max 340; job hard limit 6 h).

## Components
| File | Role |
|---|---|
| `mcp/server.mjs` | MCP stdio server, 15 tools, provisioning, UI parsing (uiautomator XML), crash/ANR detection, test runner, reports |
| `runner/agent.mjs` | Device agent on the runner: token auth, adb exec, screenshot, APK upload+install (aapt badging), live-view page, shutdown |
| `.github/workflows/android-cloud.yml` | One run = one device |
| `skills/*` | android-emulator, android-qa, android-debug, android-visual-test, android-test-report |
| `.mcp.json`, `.claude-plugin/*` | Plugin + marketplace manifests |

## Security
- Token generated on the runner, only published RSA-OAEP(SHA-256)-encrypted; job logs never print it.
- The agent listens on 127.0.0.1; only reachable through the tunnel with the token.
- The `android_watch` link embeds the token: private, valid only while the session lives.
- Your GitHub token stays in your local environment; the workflow only uses `contents: read, actions: read`.

## Why this design (comparison)
| Option | Interactive | Free | Card | Verdict |
|---|---|---|---|---|
| GitHub Actions + KVM emulator | yes | yes (public repo: unlimited std minutes; private: 2000 min/month) | no | **chosen** |
| Firebase Test Lab | no (batch only) | 10 virtual tests/day | no for Spark | not interactive |
| Genymotion SaaS | yes | trial only, then per-minute | yes | paid |
| BrowserStack / Sauce Labs / LambdaTest | yes | short trial | usually | paid |
| AWS Device Farm | yes | 1000 min one-time trial | yes | paid |
| Self-hosted (Oracle Free Tier ARM) | yes | yes | yes (verification) | no KVM for x86 images; ARM emulation impractical |
