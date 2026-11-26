# Cloud-only mode — "Teste Melodix" with nothing on your PC or phone

```
 claude.ai/code (browser or Claude mobile app)       GitHub Actions (free, public repo)
 ┌──────────────────────────────────────────┐        ┌───────────────────────────────┐
 │ Claude Code CLOUD session on this repo   │dispatch│ Android 14 emulator (KVM)     │
 │  ├ MCP server android-cloud (.mcp.json)  │───────►│ runner/agent.mjs (adb/HTTPS)  │
 │  ├ build: Java + apktool + build-tools   │◄───────│ Cloudflare quick tunnel       │
 │  ├ Melodix sources (git clone, public)   │encrypted└───────────────────────────────┘
 │  └ skill test-melodix                    │artifact
 └──────────────────────────────────────────┘
 GitHub auth: the session's own GitHub connection (proxy-injected). No PAT, no local MCP config.
```

To use it from the **Melodix** repo instead of this one, install the plugin: [PLUGIN.md](PLUGIN.md).

## Procedure (phone or browser)
1. Open **claude.ai/code** (or the Claude app → Code), choose the repository **Souxch06/Android_Emulator_Claude_Code**
   (default branch `ccr-ea67e9ee-ors7nn`, which holds this setup).
2. Type **« Teste Melodix »** (or « Teste Melodix sur la branche X » after a fix).
3. Answer the permission prompts if your permission mode shows them (see below). Nothing else.
   Results: report + screenshots in `android-cloud-artifacts/` of the session; the session can commit them on request.

## Validated in a session opened from the Claude Code Cloud interface (2026-11-26)
Session resumed from the claude.ai interface; nothing started by hand. Evidence: run
[45766375136](https://github.com/Souxch06/Android_Emulator_Claude_Code/actions/runs/45766375136) (11 min, `success`),
screenshots and JSON in [`validation-2026-11-26/`](validation-2026-11-26/).

| Capability | Result |
|---|---|
| `.mcp.json` auto-loaded, server started by the session (`node mcp/server.mjs`) | ✅ 15 `mcp__android-cloud__*` tools offered by the interface |
| Skill `test-melodix` loaded from `.claude/skills/` | ✅ listed by the interface |
| GitHub auth without PAT | ✅ workflow dispatched, run polled, artifact downloaded and decrypted, run ended |
| Melodix sources + cloud build (apktool 2.9.3, build-tools 35, test key + official fingerprint mechanism) | ✅ `main@816f29a`, then `fix/crashguard-null-toast@94c0476` |
| Emulator start / install / launch / tap / swipe / back / screenshots / logcat / stop | ✅ |
| Fix → rebuild → reinstall → retest loop | ✅ 2 iterations in the same session |
| Push a fix branch to Melodix | ✅ after attaching the repo with write access (the session asked; no PAT) |

Earlier (2026-11-25) the same flow was validated with `claude -p` (CLI) inside a cloud container: see VALIDATION.md.

## Melodix results (Android 14 emulator, no Spotify account)
| Area | Result |
|---|---|
| Cold start (fresh install) | `main`: toast **"Melodix a plante : null"** (01). Fixed branch: no toast (02) |
| Restart after force-stop ×2 | no crash, home displayed, no toast with fixed build (03, 04) |
| Accueil / Rechercher / Bibliothèque / Paramètres, tab switching, swipes, back | ✅ `ui-tabs` 13/13, `settings-back-errors` 13/13 |
| Error handling | "Bibliothèque Spotify indisponible (HTTP 401)", "Réessayer" works without crash (10) |
| Search | "Recherche indisponible — nécessite un accès confirmé": intended gating, not a bug (07) |
| Playlists | hidden without Spotify ("Les playlists restent masquées") — **not testable** |
| Spotify login page → back | returns to Accueil in < 3 s; "Going Back…" is a small transient label from the WebView/page, not in Melodix code; **black screen not reproduced** (11–13) |
| Crashes / ANR (whole session) | 0 / 0 |
| Audius, YouTube | **absent from the Melodix code** at `816f29a` (no endpoint, no UI) — nothing to test |
| Audio player | only the Spotify Web Player exists; needs a logged-in account — **not testable** |

### Bug fixed (branch `fix/crashguard-null-toast`, Souxch06/Melodix — not merged)
`NativeCrashGuard` showed "Melodix a plante : null" when **no** crash report existed. Fix (3 lines): no report → no toast.
A first, broader fix (inverting both conditions) was **rejected after an emulator run**: it surfaced diagnostic reports
written during normal runs by the startup watchdog as "Melodix a plante : Previous diagnostic details redacted" on every
launch (05). Open question for the owner: the stage/report branches of that toast look inverted; left unchanged.

## Spotify: strategy if you decide to provide a test account
Never bypass auth. If you give a **dedicated test account** (not your personal one) in the chat for a session, Claude
types it in the Spotify login WebView on the emulator, then tests library, playlists, search and playback. The emulator
is destroyed at `android_stop`, so cookies do not persist; credentials are not saved in the repo or memory.
Without it: only login screen and error handling are testable.

## Permissions
| Confirmation | Needed? |
|---|---|
| Approve project MCP server `android-cloud` | Once per session if your mode asks; low risk (code from this repo) |
| `mcp__android-cloud__*` tool calls | Can be allowed for the session; they only act on the disposable emulator and this repo's Actions |
| `bash cloud/build-melodix.sh` | Can be allowed; downloads public tools, builds in `~/.android-cloud/work` |
| Attaching Melodix with **write** access / pushing a fix branch | **Keep manual**: it writes to another repository |
| Merging into Melodix `main` | Never done by Claude; your decision |

No `.claude/settings.json` auto-approval is committed: choosing auto-approval is the user's decision.

## Limits (not validated / impossible)
- Spotify library, playlists, search, playback: need an account. Audius/YouTube: not in the app.
- Cold boot noise: the emulator may show "Pixel Launcher isn't responding" (dismiss, not an app bug).
- Cloud container is ephemeral: tools and sources re-download each session (~1 min); device boot ~2–3 min.
- Free limits: public repo → standard runners free; 6 h max per job; Cloudflare quick tunnel free, no SLA.
