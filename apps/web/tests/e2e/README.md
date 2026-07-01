# E2E testing

Playwright end-to-end tests for the web app. Three projects are defined in
`apps/web/playwright.config.ts`:

| Project         | What it runs                                         | Session                   |
| --------------- | ---------------------------------------------------- | ------------------------- |
| `chromium`      | Unauthenticated specs (e.g. `rbac-unauthenticated`)  | none                      |
| `setup`         | `auth.setup.ts` — signs in via hosted WorkOS AuthKit | creates `.auth/user.json` |
| `authenticated` | Specs under `tests/e2e/authenticated/**`             | reuses `.auth/user.json`  |

The `authenticated` project depends on `setup` (Playwright's setup-project
pattern): `auth.setup.ts` navigates to `/dashboard`, follows the middleware
redirect to the hosted AuthKit sign-in page, submits the test user's email +
password, waits to land back on `/dashboard`, and saves the session cookies
to `tests/e2e/.auth/user.json` (gitignored — it contains live cookies).

## Skip safety

If `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` are not set, the `setup` project
and every authenticated spec **skip** with an explanatory message — they
never fail. The unauthenticated `chromium` project always runs. The suite
therefore stays green on machines without credentials (including CI).

## Enabling authenticated runs

1. **Create a test user in WorkOS** (use the staging environment):
   - WorkOS Dashboard → your staging environment → **User Management → Users**
     → **Create user**.
   - Give it an email and set a **password** (email + password auth must be
     enabled for the environment: **Authentication → Email + Password**).
   - Sign in once through the app (or accept an invite) so the user has a
     Convex profile, then create an **organization it owns** with **at least
     one project** — the invite-panel spec requires those fixtures and fails
     with an explicit message if they're missing.

2. **Add credentials to the root `.env.local`** (the monorepo root file —
   Playwright loads it via `tests/e2e/env.ts`, no dotenv needed):

   ```bash
   E2E_TEST_EMAIL=e2e@yourdomain.com
   E2E_TEST_PASSWORD=your-strong-password
   ```

3. **Run** (the dev server on :3000 is reused if already running; never start
   it manually — Playwright's `webServer` handles it):

   ```bash
   cd apps/web && bunx playwright test              # everything
   cd apps/web && bunx playwright test --project=authenticated
   cd apps/web && bunx playwright test tests/e2e/authenticated/invite-panel.spec.ts
   cd apps/web && bunx playwright test tests/e2e/rbac-unauthenticated.spec.ts
   ```

To force a fresh sign-in (e.g. after the session expires), delete
`tests/e2e/.auth/user.json` and re-run.
