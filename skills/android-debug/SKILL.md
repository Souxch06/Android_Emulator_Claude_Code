---
name: android-debug
description: Diagnose Android crashes, ANRs, freezes and runtime errors on the remote cloud device using logcat, crash buffer and UI state. Use when an app crashes, hangs, shows errors, or a test fails.
---

# Android debugging

1. `android_logcat {crashes_only:true, package}` → FATAL EXCEPTION stack traces + ANR lines.
2. Context: `android_logcat {package, level:"W", lines:500}` or `{grep:"Exception|Error|<Tag>"}`.
3. Reproduce deterministically: `android_launch_app {action:"clear_data"}`, `android_logcat {clear:true}`, then replay the minimal steps with `android_test` until the crash is reliable.
4. Read the stack trace top frames belonging to the app package; map them to source files in the project; explain the root cause (null, lifecycle, threading, permissions, network on main thread...).
5. ANR: look for `ANR in <pkg>` + "Reason:"; check main-thread blocking work in the source.
6. App not starting: `android_status` focus, `android_launch_app` error text, `android_logcat {grep:"ActivityManager|PackageManager"}`.
7. Propose the fix, then verify it with a reinstall + the reproduction sequence (must now pass).

Report: symptom, exact repro steps, stack trace excerpt, root cause, fix, verification evidence.
