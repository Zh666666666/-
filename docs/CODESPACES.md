# Cloud Development

This repository supports GitHub Codespaces and Codex cloud development. The
local Windows computer does not need to stay online after changes are pushed.

## Start A Codespace

1. Open the repository on GitHub.
2. Select **Code**, then **Codespaces**, then **Create codespace on main**.
3. Wait for `npm ci` and the development server to start.
4. Open the forwarded port named **TKA Rehab Platform**.

The app starts in demo mode when database variables are absent. Demo data is
stored in memory and is reset whenever the development server restarts.

## Codespaces Secrets

Add real credentials under GitHub **Settings > Codespaces > Secrets** and grant
this repository access. Use these names:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (optional)
- `ANTHROPIC_API_KEY` (optional)
- `NEXT_PUBLIC_APP_URL`

Never commit `.env` files or paste secret values into issues, prompts, commits,
or pull requests. Restart the codespace after adding or changing a secret.

For Supabase authentication, set `NEXT_PUBLIC_APP_URL` to the forwarded HTTPS
URL and add the same URL to the allowed redirect URLs in Supabase.

## Mobile Codex Workflow

1. Ask Codex to work on the GitHub repository.
2. Let Codex create a branch, run checks, and open a pull request.
3. Review the pull request and the GitHub Actions build from the phone.
4. Start a Codespace only when an interactive terminal or browser preview is
   needed.
5. Merge the pull request after verification.

`AGENTS.md` and the project skills under `.agents/skills` and `.codex/skills`
are committed so local and cloud Codex sessions follow the same repository
rules.

## Hardware Boundary

GitHub Codespaces cannot connect directly to a nearby WT9011DCL-BT50 over BLE.
A phone, computer, or dedicated gateway near the sensor must read the device
and upload samples to the application API. Codespaces can develop and test that
API, but it is not the physical sensor gateway.

## Public Repository Boundary

The GitHub repository is public. The following local support artifacts are
excluded from Git:

- `copyright-materials/`
- `research/`
- PowerPoint build and font-test files

Review these files separately before ever moving them into a public repository.
