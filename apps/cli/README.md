# @envpilot/cli

The official CLI for [Envpilot](https://www.envpilot.dev) -- a secure environment variable management platform for teams.

Sync, share, and manage `.env` files across your team without leaking secrets in Slack, email, or Git. Variables are encrypted at rest using [WorkOS Vault](https://workos.com/vault) and access is enforced through role-based permissions.

## Install

```bash
npm install -g @envpilot/cli
```

With bun:

```bash
bun install -g @envpilot/cli
```

Or run without installing:

```bash
npx @envpilot/cli login
```

## Quick Start

```bash
# One-command setup: authenticate, select a project, and pull variables
envpilot sync

# Or step by step:
envpilot login                   # Authenticate with your Envpilot account
envpilot init                    # Link the current directory to a project
envpilot pull                    # Pull variables into a local .env file
```

## Interactive Terminal UI

Run `envpilot` with no arguments to open the interactive TUI. Browse commands, read documentation, and launch any command directly from the keyboard-driven dashboard.

```bash
envpilot
```

The TUI returns after each command finishes, so you can run multiple commands in one session. Press **Esc** to exit.

## Commands

### Getting Started

| Command                    | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `envpilot`                 | Open the interactive terminal UI                        |
| `envpilot ui`              | Open the interactive terminal UI (explicit)             |
| `envpilot login [options]` | Authenticate with your Envpilot account                 |
| `envpilot sync [options]`  | Authenticate, select a project, and pull in one flow    |
| `envpilot init [options]`  | Link the current directory to a project and environment |
| `envpilot man [command]`   | Show the CLI manual page                                |

### Syncing Variables

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `envpilot pull [options]` | Pull variables into a local `.env` file |
| `envpilot push [options]` | Push local `.env` changes to Envpilot   |

### Variable Requests

Developers don't have direct write access — instead they submit a request,
and an owner, project manager, or team lead reviews it on the dashboard
(choosing the final environments on approval).

| Command                       | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `envpilot request [options]`  | Request a new variable (interactive: key, value, environments)         |
| `envpilot requests [options]` | List variable requests for the linked project with their review status |

```bash
envpilot request                     # guided prompt: key → value → description → environments
envpilot requests                    # all requests for the linked project
envpilot requests --status pending   # filter: pending | approved | rejected | canceled
```

Environment choices are limited to the environments you have access to —
a developer scoped to `development` cannot request a production variable.

### Browsing Resources

| Command                       | Description                                        |
| ----------------------------- | -------------------------------------------------- |
| `envpilot list`               | List projects in the active organization (default) |
| `envpilot list organizations` | List your organizations                            |
| `envpilot list projects`      | List projects in the active organization           |
| `envpilot list variables`     | List variables in the active project               |
| `envpilot list linked`        | List projects linked in the current directory      |
| `envpilot usage [options]`    | Show plan usage and feature limits                 |

### Project Management

| Command                     | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| `envpilot switch [options]` | Switch the active organization, project, or environment |
| `envpilot unlink [project]` | Remove a linked project from the current directory      |

### Account

| Command                        | Description                                     |
| ------------------------------ | ----------------------------------------------- |
| `envpilot whoami`              | Show the authenticated user and active context  |
| `envpilot config [subcommand]` | View or update CLI configuration                |
| `envpilot logout`              | Revoke the session and clear stored credentials |

Run `envpilot man` for the full command reference, or `envpilot man <command>` for detailed help on a specific command.

## Common Options

| Flag                    | Applies to                                     | Description                                                          |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `--api-url <url>`       | `login`                                        | Override the API URL                                                 |
| `--no-browser`          | `login`                                        | Skip automatic browser open                                          |
| `--organization <id>`   | `sync`, `init`, `switch`                       | Target a specific organization                                       |
| `--project <id>`        | `sync`, `init`, `switch`                       | Target a specific project                                            |
| `--env <environment>`   | `sync`, `init`, `pull`, `push`, `switch`       | Target an environment (development, staging, production)             |
| `--file <path>`         | `pull`, `push`                                 | Custom file path (default: `.env`)                                   |
| `--format <format>`     | `pull`                                         | Output format: env, json, yaml, vercel, netlify, aws, docker-compose |
| `--merge` / `--replace` | `push`                                         | Merge with or replace remote variables                               |
| `--dry-run`             | `pull`                                         | Preview changes without writing to disk                              |
| `--json`                | `list projects`, `list organizations`, `usage` | Output as JSON                                                       |
| `--force`               | `unlink`                                       | Skip confirmation prompt                                             |
| `--project <id>`        | `request`, `requests`                          | Target a specific linked project                                     |
| `--status <status>`     | `requests`                                     | Filter requests: pending, approved, rejected, canceled               |

## Pull Formats

`envpilot pull` supports multiple export formats for integration with different platforms:

```bash
envpilot pull                              # .env (default)
envpilot pull --format json                # JSON
envpilot pull --format yaml                # YAML
envpilot pull --format vercel              # Vercel
envpilot pull --format netlify             # Netlify
envpilot pull --format aws                 # AWS Parameter Store
envpilot pull --format docker-compose      # Docker Compose
```

## Role-Based Access

Envpilot uses one unified organization role per user:

**Owner > Project Manager > Team Lead > Developer**

What you can do in a project follows from this role plus whether you are
assigned to the project. Developers can additionally be scoped to specific
environments, and per-variable read/write grants control their access.

| Role            | Pull                     | Push (direct) | Request new variable | Review requests | Manage permissions |
| --------------- | ------------------------ | ------------- | -------------------- | --------------- | ------------------ |
| Owner           | Yes                      | Yes           | -- (creates direct)  | Yes             | Yes                |
| Project Manager | Yes (assigned projects)  | Yes           | -- (creates direct)  | Yes             | Yes                |
| Team Lead       | Yes (assigned projects)  | Yes           | -- (creates direct)  | Yes             | Yes                |
| Developer       | Granted variables, scoped environments | No | Yes             | No              | No                 |

## Security

- Variables are encrypted at rest using [WorkOS Vault](https://workos.com/vault).
- The CLI never stores plaintext secret values on disk.
- Authentication uses a device-code flow with short-lived access tokens and refresh tokens.
- All API communication is over HTTPS.

## Requirements

- Node.js 18 or later
- An [Envpilot](https://www.envpilot.dev) account

## Links

- [Website](https://www.envpilot.dev)
- [Documentation](https://www.envpilot.dev/docs)
- [Privacy Policy](https://www.envpilot.dev/privacy)
- [Terms of Service](https://www.envpilot.dev/terms)

## License

Proprietary. See [Terms of Service](https://www.envpilot.dev/terms) for details.
