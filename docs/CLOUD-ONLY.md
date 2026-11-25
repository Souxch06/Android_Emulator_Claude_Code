# Cloud-only mode — "Teste Melodix" with nothing on your PC

```
 claude.ai/code (browser or mobile app)            GitHub Actions (free)
 ┌─────────────────────────────────────┐           ┌──────────────────────────┐
 │ Claude Code CLOUD session on repo   │ dispatch  │ Android 14 emulator +KVM │
 │ Souxch06/Android_Emulator_Claude_Code│──────────►│ agent (adb over HTTPS)   │
 │  ├ MCP server  (.mcp.json, Node)    │◄──────────│ Cloudflare quick tunnel  │
 │  ├ build tools (Java, apktool,      │ encrypted └──────────────────────────┘
 │  │   build-tools 35, downloaded)    │  artifact
 │  ├ Melodix sources (git clone)      │
 │  └ skill test-melodix               │
 └─────────────────────────────────────┘
 GitHub auth = the session's existing GitHub connection (injected by the session proxy; no token to create)
```

## How to use
Open a Claude Code cloud session on `Souxch06/Android_Emulator_Claude_Code` and type **« Teste Melodix »**
(optionally « Teste Melodix sur la branche X » to test a fix). Approve the tool prompts if your permission mode asks.

## What was really validated (2026-11-25, in a Claude Code cloud container)
| Step | Status | Evidence |
|---|---|---|
| MCP server runs in the cloud session (project `.mcp.json`) | ✅ | fresh clone, clean env: Claude Code listed the 15 `android_*` tools + skill `test-melodix` |
| GitHub auth via the session's GitHub connection | ✅ | `android_start` dispatched runs with no PAT (`GITHUB_TOKEN` from the session, proxy-injected) |
| Fetch Melodix sources | ✅ | `git clone` of `Souxch06/Melodix` (public) at `main@816f29a` |
| Build the APK in the cloud | ✅ | apktool 2.9.3 + zipalign/apksigner 35, test key, 40 s; `apksigner verify` OK |
| Emulator, install, launch, control, screenshots, logs | ✅ | run 45705803924, Melodix home/library/settings captured |
| One-sentence autonomy | ✅ | `claude -p "Teste Melodix"` did build → device → tests → REPORT.md → stop alone (≈7 min, 1 runner) |
| Retest after correction | ✅ | 2 consecutive full runs; the 2nd used the fixed build script |

## Honest limits
- **Signature**: Melodix refuses foreign signatures (anti-tamper). Cloud builds use a session test key and inject its
  fingerprint into a temporary copy (same mechanism as Melodix's `scripts/build_preview_apk.sh`). The production key is a
  Melodix CI secret and is never used. Without this step the app opens GitHub at launch (a false "crash").
- **Spotify**: no account on the emulator → library/search/playback are blocked; only login screen & error handling are testable.
  Real Spotify tests need a test account the user explicitly provides.
- **Audius / YouTube / player**: in `main@816f29a` no Audius/YouTube entry point was reachable without Spotify; not testable yet.
- **Approvals**: a new cloud session may ask once to approve the project MCP server and each tool call, depending on your
  permission mode. Auto-approval (`.claude/settings.json`) is your decision; it was not added.
- **Unverified (theoretical)**: a session started from the claude.ai UI itself — validated here with the Claude Code CLI
  inside a cloud container (same `.mcp.json`/skills loading), not by clicking in claude.ai.
- The cloud container is ephemeral: tools/clone are re-downloaded per session (~1 min).
- Classic mode (plugin on a PC) is unchanged and still works (see README).
