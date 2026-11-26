---
name: test-melodix
description: Full Android QA of Melodix on a real remote cloud emulator (android-cloud plugin) - build the APK in this cloud session, install, launch, navigate, screenshots, logcat, crash/ANR detection, report, retest after a fix. Use for "Teste Melodix", "Lance les tests Android de Melodix", "Vérifie si Melodix démarre correctement", "Teste cette nouvelle branche", "Reproduis ce bug sur l'émulateur", or any request to run/test/reproduce Melodix on Android.
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/cloud/build-melodix.sh *), Bash(bash ${CLAUDE_PLUGIN_ROOT}/cloud/build-melodix.sh *)
---

# Teste Melodix (100 % cloud)

Everything runs in this Claude Code cloud session (build) + a GitHub Actions emulator (device), driven by the
`android_*` MCP tools of the android-cloud plugin. Never ask the user to install or run anything. Ask at most one
targeted question, only if something indispensable is missing (e.g. which branch, when ambiguous).

## 0. What to test
- If the current repo is a Melodix checkout (has `apktool.yml` and `smali/`): test **its current state** — note
  `git rev-parse --abbrev-ref HEAD`, `git rev-parse --short HEAD`, and `git status --short` (uncommitted changes are
  built and must be mentioned in the report). Never commit, stash, reset or overwrite the user's changes.
- "Teste cette nouvelle branche X" / no Melodix checkout: build branch X (default `main`) from GitHub.

## 1. Build (in this session)
- Local checkout: `MELODIX_DIR="$PWD" bash ${CLAUDE_PLUGIN_ROOT}/cloud/build-melodix.sh`
- Branch from GitHub: `bash ${CLAUDE_PLUGIN_ROOT}/cloud/build-melodix.sh <branch>`
Last line = APK path. The build injects the test key's fingerprint into `expected_signature_sha256` of a temporary
copy (Melodix's own preview mechanism); the production key is never used. If the app closes and opens
github.com/Souxch06/Melodix, that is the signature refusal — a build problem, NOT an app bug.
If the build fails, report the apktool error lines; never test a stale APK.

## 2. Device
`android_start`. If it answers "Provisioning…", call `android_start` again until ready (re-attaches, never a 2nd device).
Give the `android_watch` link (private). Cold-boot "Pixel Launcher isn't responding" = emulator noise: tap "Wait".

## 3. Install + launch
`android_launch_app {package:"com.melodix.music", action:"uninstall"}` (fresh state), `android_install_apk`, then launch.
Screenshot within ~1 s of launch to catch startup toasts.

## 4. Tests — short `android_test` calls (≤15 steps, `assert_no_crash` last, `stop_on_failure:false`)
`android_inspect` first: the UI changes between versions. Known ids: tabs `nativeHomeTab`, `nativeSearchTab`,
`nativeLibraryTab`; title `nativeScreenTitle`; settings `nativeSettingsButton`; bar `nativeTabBar`.
- Cold start; restart after force-stop ×2 (`stop` then `launch`, screenshot each).
- Accueil, Rechercher, Bibliothèque (playlists), Paramètres; tab switching; swipes; back.
- Error handling (e.g. "Réessayer la bibliothèque"), Spotify login screen → back.
- Spotify without account: library/search/playlists/playback are gated → report "not testable without an account".
  Never bypass auth; only type credentials of a dedicated test account the user explicitly gives in the chat.
- Audius/YouTube/player: first `grep -rli 'audius\|youtube' smali assets`; test only entry points that exist.
  Never report as tested what was not used. Known non-bugs: search gated without Spotify; "Going Back…" label comes
  from the WebView.
- "Reproduis ce bug": turn the user's description into an `android_test` sequence; evidence = screenshots + logcat.

## 5. Evidence & diagnosis
`android_logcat {crashes_only:true, package:"com.melodix.music"}`, `android_logcat {package:"com.melodix.music", grep:"MDXTRACE|Exception|Error"}`.
Diagnose from logs + smali sources (e.g. `grep -rn "<toast text>" smali`).

## 6. Fixes (only if the user allows fixing)
Separate from testing. Dedicated branch `fix/<topic>` from the tested commit — never `main`, never merge, never push
to `main`, never delete branches, never overwrite uncommitted user work (if the tree is dirty, ask first). Smallest
fix; run Melodix's related `node --test tests/<file>`; rebuild (step 1), uninstall/reinstall, rerun the SAME tests,
check side effects (a crash-guard fix once had to be narrowed after the emulator showed new toasts). Push the branch
and give the PR link; the user decides the merge.

## 7. Report (phone-readable) & stop
Short Markdown: build (branch@sha, dirty?), Android version, run URL; table executed / passed / failed / not testable;
defects with steps, expected/actual, screenshot paths, log excerpt. Screenshots/JSON are in `android-cloud-artifacts/`
(do not commit them into Melodix unless asked). Always finish with `android_stop` and confirm the run is completed.
