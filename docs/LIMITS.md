# Limits and costs

| Item | Value |
|---|---|
| Cost (GitHub) | **Public device repo: standard runners are free** (no minute cap). Private repo on GitHub Free: $12/month of included compute ≈ 2000 Linux minutes ($0.006/min); without a payment method usage is simply **blocked** when exhausted (no surprise bill). Artifacts: 500 MB free storage (each session uses < 1 KB, kept 1 day). Source: docs.github.com billing/limits, checked 2026-11-25. |
| Cost (Cloudflare) | Quick Tunnels: free, no account. No uptime guarantee, max 200 in-flight requests per tunnel, "for testing and development". |
| Measured | Session start → ready: **~2 min** (validated run). A 6-min session consumed 6 runner minutes. |
| Startup | ~3–6 min per session (SDK image download + cold boot). |
| Session length | `minutes` input, default 60, max 340 (GitHub hard limit: 6 h per job). |
| Concurrency / relaunch | GitHub Free: 20 concurrent jobs. One MCP client drives one device at a time (session state in `~/.android-cloud/session.json`); stop + start again gives a fresh device. API: 5000 req/h per token (a session uses a few dozen). |
| Device | Android emulator x86_64, google_apis image (no Play Store), software GPU (swiftshader): fine for UI tests, slow for heavy 3D/games. |
| Boot noise | A cold-booted emulator often shows "Pixel Launcher isn't responding": the workflow dismisses system dialogs; if it reappears, tap "Wait"/"Close app". Exclude `com.google.android.apps.nexuslauncher` ANRs from app results. |
| Not available | camera input, real sensors/NFC/Bluetooth, biometrics, SIM/telephony, Play Services licensing; ARM-only native libs (apps without x86_64 .so) may not install. |
| Latency | each action ≈ 0.3–1.5 s (tunnel round-trip); live view ≈ 1 fps (screenshot polling, view-only). |
| Tunnel | Cloudflare *quick tunnel* (trycloudflare.com): free, no account, no SLA — intended for testing; URL changes every session. |
| APK size | up to ~100 MB (Cloudflare request body limit). |
| Building APKs | done on the PC if a JDK/Android SDK exists there; otherwise build in your own CI and give Claude the APK. |
| Terms | Use complies with GitHub Actions terms when used for testing your software; do not use it as a permanent always-on service. |
