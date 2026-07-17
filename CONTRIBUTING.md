# Contributing to Envpilot

Thanks for your interest in improving Envpilot. This project is open source
under the [MIT License](./LICENSE), maintained by **Syntax Lab Technology**
(developer: **Rafay**). Contributions of every size are welcome — bug reports,
docs fixes, and features alike.

## Ways to contribute

- **Report a bug** — open a [GitHub issue](https://github.com/rafay99-epic/envpilot.dev/issues) with steps to reproduce, expected vs. actual behavior, and your environment.
- **Suggest a feature** — open an issue describing the problem it solves before writing code, so we can agree on the approach.
- **Send a pull request** — see the workflow below.
- **Report a security issue** — do **not** open a public issue. Follow [SECURITY.md](./SECURITY.md).

## Project layout

Envpilot is a **bun workspaces + Turborepo** monorepo:

| Path                     | What it is                               |
| ------------------------ | ---------------------------------------- |
| `apps/web`               | Next.js dashboard + marketing site + API |
| `apps/blog`, `apps/docs` | Standalone marketing/docs sites          |
| `apps/admin`             | Admin panel                              |
| `apps/cli`               | `@envpilot/cli` (Commander.js)           |
| `apps/vscode-extension`  | VS Code extension                        |
| `convex/`                | Backend functions + schema (Convex)      |
| `packages/`              | Shared config, UI, and the GitHub Action |

Deeper maps live in [`docs/structure.md`](./docs/structure.md) and
[`docs/architecture.md`](./docs/architecture.md).

## Local setup

**Prerequisites:** [Bun](https://bun.sh) and a [Convex](https://convex.dev)
account. Full external-service setup (WorkOS, Resend, optional Polar) is in
[`docs/setup.md`](./docs/setup.md); self-hosting a full instance is in
[`docs/SELF_HOSTING.md`](./docs/SELF_HOSTING.md).

```bash
git clone https://github.com/rafay99-epic/envpilot.dev.git
cd envpilot.dev
bun install
bun run setup        # scaffolds .env.local from .env.example
bun run dev          # Next.js + Convex + Admin in parallel
```

Fill in `.env.local` (see [`.env.example`](./.env.example)). **Never commit
secrets** — `.env.local` is gitignored and a gitleaks check runs in CI.

## Development workflow

1. **Branch from `main`** — `git checkout main && git pull && git checkout -b feat/your-change`. All work happens on branches; nothing is pushed to `main` directly.
2. **Make the change.** Match the surrounding code — naming, structure, comment density. React Compiler is on, so avoid manual `useMemo`/`useCallback`.
3. **Verify locally** before opening a PR:
   ```bash
   bun run check:all     # prettier + lint + typecheck across the repo
   ```
   For feature work, add or update tests (see below).
4. **Open a pull request** against `main` with a clear description of what and why. CI runs the quality gate on every PR.
5. A maintainer reviews. Automated reviewers may comment first — address their feedback, then a human verifies before merge.

## Code style & checks

- **Formatting:** Prettier — `bun run format:fix` to apply, `bun run format:check` to verify.
- **Linting:** ESLint v9 flat config — `bun run lint`.
- **Types:** TypeScript strict — `bun run typecheck`. Convex has its own tsconfig.
- **All three at once:** `bun run check:all`. Green is required before merge.
- **Validation:** Zod v4 in API routes and the CLI; Convex validators (`v.*`) for backend args.
- **User-facing errors** must use `throw new ConvexError("…")` — production Convex redacts plain `Error` messages.

## Testing

- **Unit tests** run via the package's own runner (`bun run test`).
- **E2E (Playwright)** specs live in `apps/web/tests/e2e/authenticated/`. Feature PRs should cover the happy path and reachable edge cases by driving the real UI. Run the full local suite before opening a feature PR:
  ```bash
  cd apps/web && bunx playwright test
  ```
  E2E does **not** run in CI (it burned the cloud Convex quota) — the local suite is the gate of record.

## Commit & PR conventions

- Use clear, conventional-style commit subjects: `feat(web): …`, `fix(cli): …`, `docs: …`, `ci: …`.
- Keep PRs focused. One concern per PR is easier to review than a grab-bag.
- Bump the relevant `package.json` version for user-facing changes (see the versioning rules in [`CLAUDE.md`](./CLAUDE.md)), and update the release manifest in `apps/web/src/lib/versions.ts` when publishing a CLI/extension/web release.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE).
