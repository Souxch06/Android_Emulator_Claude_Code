# android-cloud — a remote Android device for Claude Code

Claude Code plugin that gives Claude **its own Android emulator in the cloud**: no phone, no USB, no Android Studio,
no local emulator, no GPU, no paid subscription. Claude can install an APK, drive the UI, read the screen, take
screenshots, read logcat, detect crashes/ANRs, run test sequences and write a report — while you watch live in your browser.

**How**: the device is an official Android emulator (API 34) booted with KVM on a free GitHub Actions runner in *your*
GitHub account. A tiny agent exposes `adb` over an encrypted Cloudflare quick tunnel. The MCP server on your PC
(Node, zero dependencies) starts/stops it and exposes 15 tools. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Install (one procedure)
1. Install Node.js 18+.
2. Fork this repo (it is also your device host) and enable Actions on the fork.
3. Create a fine-grained token (Actions: read/write, Contents: read) for the fork.
4. Put `ANDROID_CLOUD_REPO` and `ANDROID_CLOUD_GH_TOKEN` in `~/.claude/settings.json` → `env`.
5. In Claude Code: `/plugin marketplace add <you>/<fork>` then `/plugin install android-cloud@android-cloud`, restart.

Step-by-step: [Windows install](docs/INSTALL-WINDOWS.md) · [Cloud setup](docs/CLOUD-SETUP.md) · [Usage](docs/USAGE.md) · [Limits & costs](docs/LIMITS.md) · [Validation report](docs/VALIDATION.md)

Then ask: *"Test this APK: C:\path\app.apk"*.

## Contents
- `mcp/server.mjs` — MCP server: `android_start, android_stop, android_status, android_install_apk, android_launch_app, android_screenshot, android_inspect, android_tap, android_swipe, android_type, android_press, android_logcat, android_wait, android_test, android_watch`
- `runner/agent.mjs` + `.github/workflows/android-cloud.yml` — the cloud device
- `skills/` — `android-emulator`, `android-qa`, `android-debug`, `android-visual-test`, `android-test-report`
- `scripts/validate.mjs` — end-to-end validation against a real remote device

License: MIT.
