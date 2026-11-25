---
name: android-qa
description: Functional QA of an Android app on the remote cloud device - build the APK, install, explore features, run test sequences, find bugs, retest after fixes. Use when asked to test an app/APK or a project.
---

# Android functional QA

Requires the `android-emulator` skill workflow (start / observe → act → verify / stop).

## Full workflow
1. **Get the project**; find the build: `gradlew` (`./gradlew assembleDebug` → `app/build/outputs/apk/debug/*.apk`), Flutter (`flutter build apk --debug`), React Native (`cd android && ./gradlew assembleDebug`). If the user's PC cannot build (no JDK/SDK), say so and ask for an APK, or build in CI — do not pretend.
2. `android_start`, share `android_watch` link.
3. `android_install_apk` → note `package`.
4. `android_logcat {clear:true}` then `android_launch_app`.
5. **Explore**: inspect each screen, list features (buttons, menus, forms). Build a short test plan (happy paths, empty/invalid input, rotation via back/home, back navigation, long text, repeat taps).
6. **Execute** with `android_test` — one test per feature. Always end steps with `{"do":"assert_no_crash"}` and add `screenshot` steps at key states. Example:
   ```json
   {"name":"login-empty","package":"com.app","steps":[
     {"do":"launch"},{"do":"wait","text":"Login"},
     {"do":"tap","text":"Sign in"},{"do":"assert_visible","text_contains":"required"},
     {"do":"screenshot"},{"do":"assert_no_crash"}]}
   ```
7. For every failure: reproduce it once more manually, collect `android_logcat {crashes_only:true, package}` + screenshot (see `android-debug`).
8. Report with `android-test-report`.
9. After a fix: rebuild, `android_install_apk` again, re-run the **same** `android_test` sequences (regression), compare.

## Rules
- A test passes only if `android_test` returned `passed: true`. Never claim success without that evidence.
- Distinguish clearly: executed / failed / not executed (and why).
