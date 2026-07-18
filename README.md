<p align="center">
  <img src="assets/logo.png" alt="Envpilot" width="120" />
</p>

<h1 align="center">Envpilot</h1>

<p align="center"><strong>Open-source environment variable &amp; secrets manager for teams.</strong><br />
CLI, VS Code extension, web dashboard, GitHub Action — and an MCP server that gives AI agents scoped, audited access to secrets without ever exposing your <code>.env</code>.</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License: MIT" /></a>
  <a href="https://github.com/rafay99-epic/envpilot.dev/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/rafay99-epic/envpilot.dev/ci.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=CI" alt="CI" /></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-3b82f6?style=flat-square" alt="PRs welcome" /></a>
  <a href="https://envpilot.dev"><img src="https://img.shields.io/badge/website-envpilot.dev-0ea5e9?style=flat-square&logo=safari&logoColor=white" alt="Website" /></a>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=EnvPilot.envpilot"><img src="https://img.shields.io/visual-studio-marketplace/v/EnvPilot.envpilot?style=flat-square&logo=visualstudiocode&logoColor=white&label=VS%20Code" alt="VS Code Marketplace" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=EnvPilot.envpilot"><img src="https://img.shields.io/visual-studio-marketplace/i/EnvPilot.envpilot?style=flat-square&logo=visualstudiocode&logoColor=white&label=installs" alt="VS Code Installs" /></a>
  <a href="https://open-vsx.org/extension/envpilot/envpilot"><img src="https://img.shields.io/open-vsx/v/envpilot/envpilot?style=flat-square&logo=vscodium&logoColor=white&label=Open%20VSX" alt="Open VSX" /></a>
  <a href="https://open-vsx.org/extension/envpilot/envpilot"><img src="https://img.shields.io/open-vsx/dt/envpilot/envpilot?style=flat-square&logo=vscodium&logoColor=white&label=downloads" alt="Open VSX Downloads" /></a>
  <a href="https://www.npmjs.com/package/@envpilot/cli"><img src="https://img.shields.io/npm/v/@envpilot/cli?style=flat-square&logo=npm&logoColor=white&label=CLI" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@envpilot/cli"><img src="https://img.shields.io/npm/dm/@envpilot/cli?style=flat-square&logo=npm&logoColor=white&label=downloads" alt="npm Downloads" /></a>
</p>

---

## Why Envpilot

Most teams still share `.env` files over Slack and hope for the best. Envpilot
replaces that with one encrypted source of truth your whole team — and your AI
tooling — pulls from:

- **Encrypted end to end** — secret values live in WorkOS Vault (AES-256-GCM).
  The database stores only opaque reference IDs; a database breach yields zero
  plaintext secrets.
- **Every surface you work in** — web dashboard, CLI, VS Code extension,
  GitHub Action, REST API, and an MCP server.
- **Per-environment variables** — `DATABASE_URL` for development and
  production are separate values with one deterministic resolution rule.
- **Role-based access control** — admin / team lead / member, down to
  per-variable permissions, with a full audit log.
- **Built for the AI-agent era** — agents (Claude Code, Cursor, anything
  MCP-capable) get scoped, audited, revocable access to exactly the secrets
  you grant. Your raw `.env` never enters a prompt.
- **Open source (MIT)** — read the code, audit how your secrets are handled,
  or [run your own instance](docs/SELF_HOSTING.md). No trust-me-bro security.

## Get started

**Cloud (fastest):** sign up free at [envpilot.dev](https://www.envpilot.dev) —
3 projects, 3 teammates, no credit card.

```bash
# Install the CLI
npm install -g @envpilot/cli

# Authenticate and pull your variables
envpilot login
envpilot pull

# Or run a command with your variables injected — no .env file on disk
envpilot run -- npm run dev
```

**VS Code:** install
[Envpilot from the Marketplace](https://marketplace.visualstudio.com/items?itemName=EnvPilot.envpilot)
(or [Open VSX](https://open-vsx.org/extension/envpilot/envpilot)) and your
variables sync in-editor.

**CI/CD:** use the
[GitHub Action](https://github.com/rafay99-epic/envpilot-action) to pull
variables into any pipeline, with values masked in workflow logs.

**AI agents:** point any MCP client at the
[Envpilot MCP server](https://docs.envpilot.dev/mcp-server) with a scoped API
key — the agent reads the secrets you allow, every access is audit-logged.

**Self-host:** the whole platform runs as your own instance — see
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Security model

Envpilot is a secrets manager, so the boring details matter:

- Secret values are stored encrypted in WorkOS Vault; the database holds only
  vault reference IDs — never plaintext.
- API keys and service tokens are stored as SHA-256 hashes, org-scoped, with
  dynamic scopes and optional expiry.
- Every read, write, share, and denial is audit-logged. Reads fail loudly —
  never partial data, never sentinel values.
- Found a vulnerability? Please report it privately — see
  [SECURITY.md](SECURITY.md).

## Docs

- [Setup](docs/setup.md) (prerequisites, env vars, install)
- [Commands](docs/commands.md) (dev, build, test, deploy)
- [Architecture](docs/architecture.md) (data flow, auth, RBAC)
- [Project Structure](docs/structure.md) (folder layout)
- [CI / CD](docs/ci.md) (GitHub Actions)
- [Development Guide](docs/DEVELOPMENT.md) (conventions, Convex, TypeScript)
- [Deployment Guide](docs/DEPLOYMENT.md) (Vercel, Convex, npm, Open VSX)
- [Features](docs/FEATURES.md) (full feature inventory)
- [Contributing](CONTRIBUTING.md) · [Security Policy](SECURITY.md)
- [Self-Hosting](docs/SELF_HOSTING.md) (run your own instance)

Product docs for users live at [docs.envpilot.dev](https://docs.envpilot.dev).

## Contributing & development

Envpilot is a Bun + Turborepo monorepo: Next.js web app, Convex backend, CLI,
VS Code extension, and shared packages.

```bash
bun install
bun run setup
# edit .env.local with your credentials
bun run dev
```

```
apps/
  web/                # Next.js web dashboard (@envpilot/web)
  blog/               # Blog — blog.envpilot.dev (@envpilot/blog)
  docs/               # Docs site — docs.envpilot.dev (@envpilot/docs)
  cli/                # CLI npm package (@envpilot/cli)
  admin/              # Admin dashboard (@envpilot/admin)
  vscode-extension/   # VS Code extension (envpilot)
convex/               # Shared Convex backend
packages/
  ui/                 # Shared React UI components (@envpilot/ui)
  tsconfig/           # Shared TypeScript configs
  eslint-config/      # Shared ESLint config
  prettier-config/    # Shared Prettier config
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow — issues and PRs
welcome.

## License

[MIT](./LICENSE) © Syntax Lab Technology and Rafay.

---

<p align="center">
  Built in the open &middot; <a href="https://www.envpilot.dev">envpilot.dev</a>
  <br />
  <sub>Developed at <a href="https://syntaxlabtechnology.com">Syntax Lab Technology</a> &middot; Lead dev <a href="https://rafay99.com">rafay99.com</a></sub>
</p>
