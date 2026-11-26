---
name: test-melodix
description: Full autonomous Melodix QA in the cloud - fetch Melodix sources from GitHub, build the APK in this session, run it on the remote Android emulator, test Spotify/Audius/YouTube/player, collect screenshots/logs, write a report. Use when the user says "Teste Melodix", "test Melodix", or asks to retest after a fix.
---

# Teste Melodix (100 % cloud)

Everything runs in this Claude Code cloud session + a GitHub Actions emulator. Never ask the user to install or run anything.

1. **Build**: `bash cloud/build-melodix.sh [branch]` (default `main`) → last line = APK path; note the commit SHA it prints.
   The build injects the test key's fingerprint into `expected_signature_sha256` (temp copy), as Melodix's own preview builds do. If the app instead closes and opens github.com/Souxch06/Melodix, that is the anti-tamper signature refusal — a build problem, NOT an app bug.
   If the build fails, report the apktool error lines; never test a stale APK silently.
2. **Device**: `android_start`. If it answers "Provisioning…", call `android_start` again until ready (it re-attaches; it never creates a 2nd device). Give the user the `android_watch` link (private).
3. **Install + launch**: `android_install_apk` with the built APK, then `android_launch_app {package:"com.melodix.music"}`. A "Pixel Launcher isn't responding" dialog right after boot is emulator noise: tap "Wait".
4. **Functional tests** — short `android_test` calls (≤15 steps), `assert_no_crash` at the end. Known selectors (check with `android_inspect` first, the UI changes between versions): tabs `nativeHomeTab`, `nativeSearchTab`, `nativeLibraryTab`; settings `nativeSettingsButton`; search field `nativeSearchInput`.
   - Navigation: Accueil / Rechercher / Bibliothèque / Paramètres / back.
   - Search: type a query, submit, screenshot results.
   - **Audius**, **YouTube**: first `grep -rli 'audius\|youtube' smali assets` in the built sources; at `816f29a` they do not exist (only the Spotify Web Player). If an entry point appears in a newer version, try to play a track and verify the player (play/pause, progress changing between two screenshots, `android_logcat {grep:"MediaPlayer|ExoPlayer|AudioTrack|audio"}`). Never report them as tested if not used.
   - Known, not app bugs: search/playlists are gated without Spotify ("nécessite un accès confirmé"); the "Going Back…" label after leaving the Spotify login page comes from the WebView, not Melodix.
   - **Spotify**: the emulator has no logged-in account. Test what works without credentials (login screen opens, error handling). Never type credentials unless the user explicitly provides test credentials for this purpose; report Spotify playback as "not testable without an account".
   - Relaunch: `action:"stop"` then launch, twice; screenshot after each.
5. **Evidence**: `android_logcat {crashes_only:true, package:"com.melodix.music"}`, screenshots and JSON reports in `android-cloud-artifacts/`.
6. **Report**: follow `skills/android-test-report`; include build SHA, Android version, run URL. Separate executed / failed / not testable.
7. **Stop**: `android_stop` at the end.
8. **Fixing**: only obvious, low-risk fixes, on a dedicated branch of Souxch06/Melodix (never `main`); rebuild with `cloud/build-melodix.sh <branch>`, uninstall, reinstall, rerun the same tests, and check side effects (a first fix of the crash-guard toast had to be narrowed after the emulator showed new toasts). Pushing to Melodix needs the user's approval to attach it with write access.
9. **Retest after a fix**: restart at step 1 with the branch/commit containing the fix, rerun the same sequences, compare with the previous report.
