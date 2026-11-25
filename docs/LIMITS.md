# Limits and costs

| Item | Value |
|---|---|
| Cost | 0 € with a public device repo (GitHub Free). Private repo: 2000 free min/month, then billing must be explicitly enabled by you (spending limit defaults to 0 → runs just stop). |
| Startup | ~3–6 min per session (SDK image download + cold boot). |
| Session length | `minutes` input, default 60, max 340 (GitHub job limit 6 h). |
| Concurrency | GitHub Free: 20 concurrent jobs; one MCP client drives one device at a time. |
| Device | Android emulator x86_64, google_apis image (no Play Store), software GPU (swiftshader): fine for UI tests, slow for heavy 3D/games. |
| Not available | camera input, real sensors/NFC/Bluetooth, biometrics, SIM/telephony, Play Services licensing; ARM-only native libs (apps without x86_64 .so) may not install. |
| Latency | each action ≈ 0.3–1.5 s (tunnel round-trip); live view ≈ 1 fps (screenshot polling, view-only). |
| Tunnel | Cloudflare *quick tunnel* (trycloudflare.com): free, no account, no SLA — intended for testing; URL changes every session. |
| APK size | up to ~100 MB (Cloudflare request body limit). |
| Building APKs | done on the PC if a JDK/Android SDK exists there; otherwise build in your own CI and give Claude the APK. |
| Terms | Use complies with GitHub Actions terms when used for testing your software; do not use it as a permanent always-on service. |
