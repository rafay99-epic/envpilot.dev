# Project Structure

```
envpilot/
├── convex/                        # Convex backend functions & schema
│   ├── schema.ts                  # Database schema definition
│   ├── _generated/                # Auto-generated types (by convex dev)
│   └── *.ts                       # Queries, mutations, actions
│
├── apps/
│   ├── web/                       # Next.js web dashboard (@envpilot/web)
│   │   ├── src/
│   │   │   ├── app/               # App Router (pages + API routes)
│   │   │   ├── components/        # React components
│   │   │   ├── hooks/             # Custom hooks (Convex wrappers)
│   │   │   ├── lib/               # Auth, vault, polar, email, tier-limits
│   │   │   └── stores/            # Zustand state stores
│   │   └── tests/e2e/             # Playwright test specs
│   │
│   ├── blog/                      # Blog — blog.envpilot.dev, port 3001 (@envpilot/blog)
│   │
│   ├── docs/                      # Docs site — docs.envpilot.dev, port 3002 (@envpilot/docs)
│   │                              #   serves feed.xml, llms.txt, llms-full.txt, /md/[slug]
│   │
│   ├── cli/                       # CLI npm package (@envpilot/cli)
│   │   └── src/
│   │       ├── commands/          # CLI commands
│   │       └── lib/               # CLI utilities
│   │
│   ├── admin/                     # Admin dashboard (@envpilot/admin)
│   │   └── src/
│   │
│   ├── vscode-extension/          # VS Code extension (envpilot)
│   │   └── src/
│   │       ├── providers/         # Tree view providers
│   │       ├── services/          # Extension services
│   │       └── ui/                # VS Code UI components
│   │
│   └── jetbrains-plugin/          # JetBrains IDE plugin (Gradle + Kotlin)
│       └── src/main/kotlin/       # auth, sync, guards, editor, ui, actions
│
├── packages/                      # Shared packages
│   ├── ui/                        # Shared React UI components (@envpilot/ui, TS source)
│   ├── github-action/             # Envpilot GitHub Action (@envpilot/github-action)
│   ├── tsconfig/                  # TypeScript base configs
│   ├── eslint-config/             # ESLint shared config
│   └── prettier-config/           # Prettier shared config
│
├── docs/                          # Documentation
├── turbo.json                     # Turborepo pipeline config
├── package.json                   # Root workspace config
└── .env.example                   # Environment variable template
```

## Key Notes

- **`convex/`** must stay at the monorepo root (Convex CLI requirement)
- **`convex/_generated/`** is auto-generated during `bun run dev` — don't edit manually
- **Path alias**: `@/*` maps to `./src/*` in the web app; `@convex/*` maps to `../../convex/*`
- **Shared configs** in `packages/` are referenced via workspace dependencies
