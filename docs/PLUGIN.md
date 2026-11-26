# android-cloud — Claude Code plugin

Gives Claude a real Android 14 emulator in the cloud (GitHub Actions runner + KVM of
`Souxch06/Android_Emulator_Claude_Code`), from **any** repository — in particular from the Melodix repo.

Contents (all loaded by Claude Code's plugin system):
| Component | File | Notes |
|---|---|---|
| Manifest | `.claude-plugin/plugin.json` | name `android-cloud`, declares the MCP server |
| Marketplace | `.claude-plugin/marketplace.json` | this repo is its own marketplace `android-cloud` |
| MCP server (15 tools) | `mcp/server.mjs` (Node ≥ 18, zero deps) | `android_start/stop/status/install_apk/launch_app/screenshot/inspect/tap/swipe/type/press/logcat/wait/test/watch` → `mcp__plugin_android-cloud_android-cloud__*` |
| Skills | `skills/` | `test-melodix` (+ android-emulator, android-qa, android-debug, android-visual-test, android-test-report) |
| Melodix cloud build | `cloud/build-melodix.sh` | apktool + build-tools downloaded in the session, test key + Melodix fingerprint mechanism |
| Device | `.github/workflows/android-cloud.yml`, `runner/agent.mjs` | dispatched in `Souxch06/Android_Emulator_Claude_Code` |

Auth: in Claude Code Cloud the session's GitHub connection is used (no PAT). On a PC: `ANDROID_CLOUD_GH_TOKEN`.

## Install — Claude Code Cloud (phone or browser)
Cloud sessions start from a fresh container: plugins installed "for the user" in an earlier session do **not**
carry over, and marketplaces declared in a repo's `.claude/settings.json` are **not** added there (official docs,
"Cloud environments → what carries over"). Two ways that do work:

**A. Environment setup script (verified, see Validation).** In claude.ai/code → environment settings → *Setup script*:
```bash
claude plugin marketplace add "Souxch06/Android_Emulator_Claude_Code#plugin/melodix-cloud" || claude plugin marketplace update android-cloud
claude plugin install android-cloud@android-cloud --scope user
```
Every new session in that environment (e.g. on `Souxch06/Melodix`) then has the plugin. After the PR is merged,
replace `#plugin/melodix-cloud` by the default branch (or remove the `#…`).

**B. Your claude.ai account plugins** (claude.ai/customize/plugins → add from GitHub). Documented by Anthropic for
cloud sessions; **not tested here** (it needs your account UI).

## Install — inside one session / CLI / PC
```
/plugin marketplace add Souxch06/Android_Emulator_Claude_Code#plugin/melodix-cloud
/plugin install android-cloud@android-cloud
```
(shell: `claude plugin marketplace add …` / `claude plugin install …`). Restart the session to load the MCP server.

## Use (from the Melodix repo)
Type **« Teste Melodix »** — also understood: « Lance les tests Android de Melodix », « Vérifie si Melodix démarre
correctement », « Teste cette nouvelle branche X », « Reproduis ce bug sur l'émulateur ».
Claude builds the checked-out state (uncommitted changes included, never modified), boots the device, installs,
tests, reports, and stops the device. Fixes only on a `fix/…` branch with your approval; never `main`, never merge.

Results: a phone-readable report in the chat; screenshots and JSON under `~/.android-cloud/artifacts/` of the
session (paths printed; ask Claude to show a screenshot). Live view: ask for « le lien android_watch ».

## Uninstall
`/plugin uninstall android-cloud@android-cloud` then `/plugin marketplace remove android-cloud`; remove the two
lines from the environment setup script.

## Permissions
The MCP tools act only on the disposable emulator and this repo's Actions; the skill pre-allows its own build
script. Pushing a fix branch to Melodix asks for write access to that repo: keep that confirmation manual.

## Limits
Spotify features need an account (not bypassed); Audius/YouTube are absent from Melodix at `816f29a`.
Device boot ≈2–4 min; Cloudflare quick tunnels have no SLA (retried 3×, android_start recovers from a failed run).
6 h max per device (GitHub job limit). Free on a public repo.
