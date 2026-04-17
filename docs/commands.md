# Commands

All commands are run from the monorepo root with `bun run`.

## Development

| Command                 | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| `bun run dev`           | Start web app + Convex + admin dashboard in parallel     |
| `bun run dev:admin`     | Admin dashboard dev server only                          |
| `bun run dev:cli`       | CLI watch mode                                           |
| `bun run dev:extension` | VS Code extension watch mode                             |

## Build

| Command                   | Description                     |
| ------------------------- | ------------------------------- |
| `bun run build`           | Build all apps                  |
| `bun run build:web`       | Build web app only              |
| `bun run build:cli`       | Build CLI only                  |
| `bun run build:admin`     | Build admin dashboard only      |
| `bun run build:extension` | Build & package extension VSIX  |

## Quality

| Command                       | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `bun run lint`                | ESLint across all workspaces                         |
| `bun run typecheck`           | TypeScript type-check all workspaces                 |
| `bunx prettier --check .`     | Prettier check (no standalone script)                |
| `bun run format:fix`          | Prettier auto-fix                                    |
| `bun run check:all`           | Full CI pipeline (lint + typecheck + build + format) |

## Testing

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `bun run test:e2e` | Playwright E2E tests (Chromium) |
| `bun run test:cli` | Vitest unit tests for CLI       |

## Deployment

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `bunx convex deploy` | Deploy Convex functions to production |

> CLI and extension publishing is handled automatically by the [CI/CD pipeline](ci.md).

## Targeting Specific Apps

All commands use Turborepo's `--filter` flag:

```bash
bunx turbo build --filter=@envpilot/web     # web app
bunx turbo build --filter=@envpilot/cli      # CLI
bunx turbo build --filter=@envpilot/admin    # admin dashboard
bunx turbo build --filter=envpilot           # extension
```
