# Cloud setup (one time, ~5 minutes, free, no credit card)

The device runs on **your own GitHub account** via GitHub Actions.

1. **Create the device repository**: on GitHub, *Fork* this repository (or create a repo and copy `.github/workflows/android-cloud.yml` and `runner/agent.mjs`).
   - Public repo → standard runner minutes are free and unlimited.
   - Private repo → 2000 free minutes/month (GitHub Free). A 60-min session ≈ 60 minutes.
   - Open the *Actions* tab of the fork once and click "I understand… enable workflows".
2. **Create a token**: GitHub → Settings → Developer settings → *Fine-grained personal access tokens* → Generate:
   - Repository access: *Only select repositories* → your device repo.
   - Permissions: **Actions: Read and write**, **Contents: Read-only** (Metadata read is automatic).
   - Copy the token (`github_pat_...`). Never commit it or paste it in a chat.
3. **Configure Claude Code** — edit `%USERPROFILE%\.claude\settings.json` (Windows) or `~/.claude/settings.json`:
   ```json
   { "env": { "ANDROID_CLOUD_REPO": "your-user/your-device-repo", "ANDROID_CLOUD_GH_TOKEN": "github_pat_..." } }
   ```
   Restart Claude Code Desktop.

Optional variables: `ANDROID_CLOUD_REF` (branch holding the workflow, default = default branch), `ANDROID_CLOUD_OUT`
(artifact folder, default `./android-cloud-artifacts`), `ANDROID_CLOUD_WORKFLOW`.
Advanced/self-hosted: set `ANDROID_CLOUD_URL` + `ANDROID_CLOUD_TOKEN` to connect directly to an agent you run yourself.

Check: ask Claude "android_status" then "start an Android device". The run is visible in your repo's *Actions* tab.
