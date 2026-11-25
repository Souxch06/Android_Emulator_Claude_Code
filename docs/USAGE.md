# Using it in Claude Code Desktop

Just ask in natural language, e.g.:

- "Test this APK: C:\Users\me\Downloads\app-debug.apk" → Claude starts the cloud device, installs, explores, tests, reports.
- "Build my project and test the login screen on Android."
- "The app crashes when I tap Save, find out why."
- "Give me the live view link." → open the link in your browser to watch the device.
- "Stop the Android device." (do it when finished — saves minutes)

Outputs: screenshots, `android_test` JSON results and `REPORT.md` in `android-cloud-artifacts/` of the current project.

## Tools (MCP server `android-cloud`)
| Tool | Purpose |
|---|---|
| android_start / android_stop / android_status | device lifecycle |
| android_install_apk | upload + install a local APK |
| android_launch_app | launch / stop / restart / clear_data / uninstall |
| android_screenshot | PNG (shown to Claude + saved) |
| android_inspect | UI tree (text, id, bounds, centers) |
| android_tap / android_swipe / android_type / android_press | input |
| android_wait | wait for element / activity / disappearance |
| android_logcat | logs, filters, crashes_only (FATAL + ANR) |
| android_test | step sequence with assertions → JSON report + failure screenshots |
| android_watch | private live-view URL |

Skills: `android-emulator`, `android-qa`, `android-debug`, `android-visual-test`, `android-test-report`.
