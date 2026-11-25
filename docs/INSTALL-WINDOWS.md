# Install on Windows

Nothing Android is installed on your PC. You need only:

1. **Claude Code Desktop** (or CLI).
2. **Node.js 18+**: https://nodejs.org (LTS installer) — or `winget install OpenJS.NodeJS.LTS`. Check in PowerShell: `node -v`.
3. **Install the plugin** — in Claude Code type:
   ```
   /plugin marketplace add <your-user>/<your-fork>
   /plugin install android-cloud@android-cloud
   ```
   (Or Desktop: *Customize → Plugins → Add marketplace*, same repo.)
4. Follow [CLOUD-SETUP.md](CLOUD-SETUP.md) (fork + token + settings.json), then restart Claude Code.
5. Type `/mcp`: `android-cloud` must be *connected* with 15 tools.

Uninstall: `/plugin uninstall android-cloud`, delete `%USERPROFILE%\.android-cloud`.
