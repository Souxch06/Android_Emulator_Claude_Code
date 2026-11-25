---
name: android-emulator
description: Start and control Claude's own remote cloud Android device (android_* MCP tools). Use whenever the user wants to run, try, install or interact with an Android app/APK without a phone or local emulator.
---

# Remote Android device

You have a real Android emulator running in the cloud (GitHub Actions runner with KVM), reached through the `android-cloud` MCP server. Nothing runs on the user's PC except the small MCP client.

## Lifecycle
1. `android_status` — reuse a running device if `state: ready`.
2. `android_start` (3–6 min first boot). Then give the user the `android_watch` link so they can watch live (tell them it is private).
3. Work (below).
4. `android_stop` when finished — it frees free-tier minutes. Never leave a device running idle.

## Driving the UI — loop: observe → act → verify
- Observe with `android_inspect` (cheap, gives text/id/center coords) and `android_screenshot` (visual truth).
- Act with selectors first: `android_tap {text|text_contains|id|desc}`; raw `x,y` only when no selector exists.
- `android_type {value, id?, clear?, submit?}`, `android_swipe {direction}`, `android_press {key: back|home|enter|...}`.
- After every action that changes screens, `android_wait` for the expected element/activity, then re-observe. Never assume an action worked.

## Apps
- `android_install_apk {path}` returns `package` and `launchable_activity`.
- `android_launch_app {package, action: launch|stop|restart|clear_data|uninstall}`.

## Troubleshooting
- "Device unreachable": `android_status`; if the run ended (time limit), `android_start` again.
- UI dump fails on animations/secure screens: take a screenshot and use coordinates.
- Missing config errors: point the user to `docs/CLOUD-SETUP.md`.
- "Pixel Launcher isn't responding" right after boot is emulator cold-start noise, not the app under test: tap "Wait" (or "Close app") and relaunch the app. Do not report launcher ANRs as app defects.
- Custom keypads: read the real ids/text with `android_inspect` before writing selectors; e.g. some "C" buttons delete one char (use `long_press`).
