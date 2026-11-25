# Validation report — 2026-11-25

All tests below ran on **real remote devices** (GitHub Actions `ubuntu-latest` runners, Android 14 / API 34 emulator,
KVM) in `Souxch06/Android_Emulator_Claude_Code`, branch `ccr-ea67e9ee-ors7nn`. Nothing is simulated.
Test driver: the MCP server over stdio (`scripts/call.mjs`, `scripts/validate.mjs`) and **real Claude Code 2.1.332**
(`claude -p --plugin-dir .`). Client side ran in a Linux cloud container (not on Windows Desktop — see "Not done").

## Passed (with evidence)
| # | Requirement | Evidence |
|---|---|---|
| 1 | Autonomous start from `android_start` (dispatch → boot → tunnel → encrypted artifact → decrypt → connect), no manual Actions step | runs 45698836818, 45699882908, 45701276183, 45702372111: "Device ready: Android 14, screen 1080x2400" in ~2 min (136 s measured) |
| 2 | APK install | Melodix v1.3.1-glass → `{"installed":true,"package":"com.melodix.music","launchable_activity":"com.melodix.music.MainActivity"}`; Simple Calculator (F-Droid) also installed |
| 3 | App launch | Melodix home screen captured (greeting, Spotify card, tabs); focus `com.melodix.music/.MainActivity` |
| 4 | Touch navigation | `android_test` melodix-navigation **18/18 passed** (tabs Rechercher/Bibliothèque/Accueil, swipes, Paramètres, back); typing "daft punk" in Melodix search and "display" in Android Settings; calculator 6×7 → assert "42" **10/10 passed** |
| 5 | Screenshots returned to Claude | MCP `image` content (1080×2400 PNG) + saved files; Claude Code read them in its own run |
| 6 | Android logs | `android_logcat` per-package (pid) and grep, e.g. Melodix `MelRowGeom` lines |
| 7 | Real crash detection | `kill -SEGV` on the app process (adb root): process died and restarted with a new pid; `crashes_only` → `crash_count: 1` (Melodix and Calculator); other packages → 0; `android_test` with `assert_no_crash` → `passed: false` + failure screenshot |
| 8 | Clean stop | `android_stop` → run `completed/success` within ~5 s, tunnel returns 530 afterwards |
| 9 | MCP reconnection | every `scripts/call.mjs` call is a **new server process** that reconnects from `~/.android-cloud/session.json`; Claude Code loaded the plugin (`--plugin-dir`), listed the 15 tools and drove whole sessions |
| — | Live view | `android_watch` page rendered in headless Chromium: image 1080×2400, status "live" |
| — | Tunnel/token security | no token → 401, wrong token → 401; token only published RSA-OAEP encrypted |
| — | Relaunch | 5 successive sessions (start → stop → start) without leftovers |
| — | Full autonomous QA by Claude Code | Claude Code tested Melodix alone: start, install, navigation tests, relaunch tests, screenshots, stop — one runner, 3 min 20 s |

## Bugs found and fixed during validation (all re-tested)
1. Workflow: AVD created outside the emulator's search path → boot hang. Fixed with `ANDROID_AVD_HOME` + fail-fast checks.
2. MCP: missing `Content-Type` on GitHub POST.  3. MCP: no retry on GitHub 5xx.
4. MCP: artifact zip uses data descriptors → decryption failed. Unzip now reads the central directory (checked against `unzip`).
5. Native crashes (SIGSEGV) were not detected; kernel truncates process names → fixed.
6. `android_type` typed before the field had focus (lost characters) → waits for focus.
7. **Claude Code times tool calls out at 60 s**: `android_start` retries started extra runners that hijacked the session
   (made Melodix look "uninstalled"). Fixed: start blocks ≤45 s and re-attaches; `android_test` has a 45 s budget.
   Orphan runs from that incident were cancelled.

## Failed / open
- Java exception crash path (`FATAL EXCEPTION`) not exercised on a real crash (`am crash` had no effect on Melodix); only native crash validated.
- Melodix finding (real, screenshots in the run): after force-stop + relaunch the app shows the toast **"Melodix a plante : null"**
  (1st relaunch opened the Spotify web login full screen). No Android-level crash in logcat → the app's own error handler. Root cause not investigated.
- A cold-booted emulator often shows "Pixel Launcher isn't responding" (emulator noise, documented; dialog dismissed by tap).

## Not done
- Installation inside **Claude Code Desktop on Windows** (no Windows machine here). Same plugin/MCP mechanism as the CLI test.
- `/plugin marketplace add` from GitHub (used `--plugin-dir`); building an APK from source (Melodix provides built APKs).
- Two devices at the same time for one client (by design one device per client).
