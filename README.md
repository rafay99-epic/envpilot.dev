<p align="center">
  <img src="assets/logo.png" alt="Envpilot" width="120" />
</p>

<h1 align="center">Envpilot</h1>

<p align="center">Secure environment variable management for teams. Bun + Turborepo monorepo powering the web dashboard, CLI, and VS Code extension.</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-proprietary-a855f7?style=flat-square" alt="License" /></a>
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

<p align="center">
  <img src="https://img.shields.io/badge/Bun-111111?style=flat-square&logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/Turborepo-0f172a?style=flat-square&logo=turborepo&logoColor=white" alt="Turborepo" />
  <img src="https://img.shields.io/badge/Next.js-111111?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Convex-2563eb?style=flat-square&logo=databricks&logoColor=white" alt="Convex" />
  <img src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind%20CSS-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>

## Docs

- [Setup](docs/setup.md) (prerequisites, env vars, install)
- [Commands](docs/commands.md) (dev, build, test, deploy)
- [Architecture](docs/architecture.md) (data flow, auth, RBAC)
- [Project Structure](docs/structure.md) (folder layout)
- [CI / CD](docs/ci.md) (GitHub Actions pipeline)
- [Development Guide](docs/DEVELOPMENT.md) (conventions, Convex, TypeScript)
- [Deployment Guide](docs/DEPLOYMENT.md) (Vercel, Convex, npm, VS Code Marketplace)
- [Features](docs/FEATURES.md) (full feature inventory)
- [Roadmap](docs/ROADMAP.md) (planned features)
- [Security TODO](docs/SECURITY-TODO.md) (pre-launch security checklist)

## Quick Start

```bash
bun install
bun run setup
# edit .env.local with your credentials
bun run dev
```

## Repo Layout

```
apps/
  web/                # Next.js web dashboard (@envpilot/web)
  cli/                # CLI npm package (@envpilot/cli)
  admin/              # Admin dashboard (@envpilot/admin)
  vscode-extension/   # VS Code extension (envpilot)
convex/               # Shared Convex backend
packages/
  tsconfig/           # Shared TypeScript configs
  eslint-config/      # Shared ESLint config
  prettier-config/    # Shared Prettier config
```

## License

This project is proprietary software. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by the Envpilot team &middot; <a href="https://www.envpilot.dev">envpilot.dev</a>
  <br />
  <sub>Developed at <a href="https://syntaxlabtechnology.com">Syntax Lab Technology</a> &middot; Lead dev <a href="https://rafay99.com">rafay99.com</a></sub>
</p>
