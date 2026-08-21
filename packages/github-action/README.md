# Envpilot GitHub Action

Pull environment variables from [Envpilot](https://www.envpilot.dev) into a GitHub Actions job — no more copy-pasting secrets into repository settings.

## Usage

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Pull environment variables
        uses: rafay99-epic/envpilot-action@v1
        with:
          token: ${{ secrets.ENVPILOT_TOKEN }}
          environment: production

      - name: Deploy
        run: ./deploy.sh # DB_URL, API_KEY, etc. are already in the environment
```

Store the service token itself as a repository or environment secret (`ENVPILOT_TOKEN` above) — never hardcode it in the workflow file.

## Inputs

| Input         | Required | Default                    | Description                                                                                      |
| ------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| `token`       | Yes      | —                          | Envpilot service token (`envpk_…`), scoped to a single project and environment.                  |
| `environment` | Yes      | —                          | Environment to pull, e.g. `production`, `staging`, `development`.                                |
| `api-url`     | No       | `https://www.envpilot.dev` | Envpilot API base URL. Override only for self-hosted or non-production instances.                |
| `export-env`  | No       | `"true"`                   | When `true`, exports every pulled variable to `$GITHUB_ENV` so later steps can read it directly. |
| `env-file`    | No       | —                          | Path to write the pulled variables as a dotenv file (`KEY='value'` per line). Skipped if unset.  |

## Workspaces

If the scoped project belongs to an Envpilot [workspace](https://docs.envpilot.dev/dashboard/overview), the pull returns the project's own variables **plus** everything inherited from that workspace — one rotation on the workspace side reaches every workflow with no action change. Workspaces themselves are never pullable; point `token` at a project.

## Outputs

| Output  | Description                              |
| ------- | ---------------------------------------- |
| `count` | Number of variables pulled from Envpilot |

## Writing a dotenv file instead of (or in addition to) exporting

```yaml
- uses: rafay99-epic/envpilot-action@v1
  with:
    token: ${{ secrets.ENVPILOT_TOKEN }}
    environment: production
    export-env: "false"
    env-file: .env
```

## Security notes

- **Values are masked in logs.** Every pulled value is registered with GitHub Actions' log masking (`core.setSecret`) before it is exported or written anywhere, so it's redacted (`***`) even if a later step in the job accidentally echoes it.
- **Tokens are project- and environment-scoped.** A service token can only read the single project and environment(s) it was minted for in Envpilot — it cannot be pointed at other projects, and it is never itself printed or logged by this action.
- **Read-only.** The token can pull variables; it cannot create, modify, or delete them.
- **Revocable.** Revoke a token at any time from Envpilot under Project Settings → CI/CD Tokens — revoked tokens are rejected on the next pull with no grace period.
- **Rate limited.** Envpilot rate-limits pulls per token; a workflow that hammers this action in a tight loop will start getting `429` responses.

## License

MIT
