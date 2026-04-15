# @envpilot/cli

The official CLI for [Envpilot](https://www.envpilot.dev) — a secure environment variable management platform for teams.

Envpilot lets you sync, share, and manage `.env` files across your team without leaking secrets in Slack, email, or Git. Variables are encrypted at rest using [WorkOS Vault](https://workos.com/vault) and access is controlled through role-based permissions.

## Install

```bash
npm install -g @envpilot/cli
```

Or with bun:

```bash
bun install -g @envpilot/cli
```

Or run without installing:

```bash
npx @envpilot/cli login
```

## Quick Start

```bash
# Open the interactive terminal UI
envpilot

# Authenticate with your Envpilot account
envpilot login

# Initialize a project in the current directory
envpilot init

# Pull environment variables into a .env file
envpilot pull

# Push local .env changes to Envpilot
envpilot push
```

## Commands

| Command                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `envpilot login`          | Authenticate with your Envpilot account             |
| `envpilot ui`             | Open the interactive Ink-powered terminal UI        |
| `envpilot man [command]`  | Show the CLI manual page                            |
| `envpilot logout`         | Log out and clear stored credentials                |
| `envpilot init`           | Link the current directory to an Envpilot project   |
| `envpilot pull`           | Pull environment variables into a local `.env` file |
| `envpilot push`           | Push local `.env` changes to Envpilot               |
| `envpilot list orgs`      | List your organizations                             |
| `envpilot list projects`  | List projects in the active organization            |
| `envpilot list variables` | List variables in the active project                |
| `envpilot switch`         | Switch the active project                           |
| `envpilot config`         | View or update CLI configuration                    |
| `envpilot whoami`         | Show the currently authenticated user               |

Run `envpilot man` for the full command reference and security notes.

## Role-Based Access

Envpilot enforces two-tier role-based access control:

**Organization roles**: Admin, Team Lead, Member

**Project roles**: Manager, Developer, Viewer

- **Viewers** have read-only access to explicitly permitted variables
- **Developers** can push changes, which creates pending approval requests
- **Managers** can push directly and approve pending requests

## Requirements

- Node.js 18 or later
- An [Envpilot](https://www.envpilot.dev) account

## Links

- [Website](https://www.envpilot.dev)
- [Privacy Policy](https://www.envpilot.dev/privacy)
- [Terms & Conditions](https://www.envpilot.dev/terms)
- [GitHub](https://github.com/rafay99-epic/envpilot.dev)

## License

This software is proprietary. See [Terms & Conditions](https://www.envpilot.dev/terms) for details.
