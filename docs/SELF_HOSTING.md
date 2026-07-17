# Self-Hosting Envpilot

Envpilot is open source (MIT) and can be run as your own instance. This guide
covers what you need and how to wire it together. It is deliberately
platform-agnostic — you can host the web app anywhere that runs Next.js, not
only Vercel.

> For contributor/dev setup (running locally against a dev Convex deployment),
> see [`setup.md`](./setup.md) and [`DEVELOPMENT.md`](./DEVELOPMENT.md). This
> document is for standing up a **production** instance you control.

## Architecture recap

```
Browser / CLI / Extension → Next.js (web app + API routes) → Convex (database)
                                                            → WorkOS Vault (encrypted secret values)
        Auth: WorkOS AuthKit   ·   Billing (optional): Polar.sh   ·   Email (optional): Resend
```

- **Convex** is the real-time database and runs your backend functions.
- **WorkOS Vault** stores the actual secret values; Convex only stores vault
  reference IDs, never plaintext.
- **WorkOS AuthKit** handles authentication.
- **Polar** (billing) and **Resend** (email) are optional — the app runs
  without them, with those features disabled.

## Required accounts

| Service                                        | Purpose                    | Required?                                  |
| ---------------------------------------------- | -------------------------- | ------------------------------------------ |
| Convex                                         | Database + backend runtime | **Yes**                                    |
| WorkOS                                         | Auth (AuthKit) + Vault     | **Yes**                                    |
| A Next.js host (Vercel, Fly, Render, a VPS, …) | Serve the web app + API    | **Yes**                                    |
| Resend                                         | Transactional email        | Optional (notifications)                   |
| Polar                                          | Subscriptions / billing    | Optional (leave off for free/internal use) |

## Steps

### 1. Fork and clone

```bash
git clone https://github.com/rafay99-epic/envpilot.dev.git
cd envpilot.dev
bun install
```

### 2. Provision Convex

```bash
bunx convex login
bunx convex deploy         # creates/deploys your production Convex deployment
```

Note the deployment URL (`https://your-project.convex.cloud`) — it becomes
`NEXT_PUBLIC_CONVEX_URL`. Set backend secrets on the deployment itself:

```bash
bunx convex env set ADMIN_SECRET "$(openssl rand -hex 32)"
# plus any backend-side keys your integrations need
```

### 3. Seed the platform data

After the first deploy, run the idempotent seed migrations so feature gates,
tiers, the role registry, and the changelog exist. In CI this runs
automatically after every deploy (see [`ci.md`](./ci.md)); to do it by hand:

```bash
for m in seed-feature-registry seed-tier-features seed-role-registry migrate-roles seed-changelog; do
  bunx convex run features/admin/migrations:runMigration \
    "$(jq -cn --arg secret "$ADMIN_SECRET" --arg name "$m" '{secret:$secret,name:$name}')"
done
```

### 4. Configure WorkOS

- Create a WorkOS project and enable **AuthKit** and **Vault**.
- Set the redirect URI to `https://your-domain.com/callback`.
- Collect: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and generate a 32+ character
  `WORKOS_COOKIE_PASSWORD`.

### 5. Environment variables

All env vars live in `.env.local` at the repo root (`bun run setup` scaffolds
it from [`.env.example`](../.env.example)). For a hosted deployment, set these
in your host's environment settings.

**Required:**

| Variable                 | Example                             |
| ------------------------ | ----------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | `https://your-project.convex.cloud` |
| `CONVEX_DEPLOYMENT`      | your deployment id                  |
| `WORKOS_API_KEY`         | `sk_live_…`                         |
| `WORKOS_CLIENT_ID`       | `client_…`                          |
| `WORKOS_COOKIE_PASSWORD` | 32+ character secret                |
| `NEXT_PUBLIC_APP_URL`    | `https://your-domain.com`           |
| `WORKOS_REDIRECT_URI`    | `https://your-domain.com/callback`  |

**Optional:**

| Variable                                                                     | Enables                       |
| ---------------------------------------------------------------------------- | ----------------------------- |
| `RESEND_API_KEY`, `FROM_EMAIL`                                               | Email notifications           |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `NEXT_PUBLIC_PAYMENTS_ENABLED` | Billing                       |
| `NEXT_PUBLIC_BLOG_URL`, `NEXT_PUBLIC_DOCS_URL`                               | Point at your blog/docs hosts |

### 6. Build and deploy the web app

Any Next.js host works. On **Vercel** (what the reference deployment uses):

- Root directory: `apps/web`
- Install command: `bun install` (from monorepo root)
- Build command: `cd ../.. && bun install && bunx turbo build --filter=@envpilot/web`
- Output directory: `.next`

On a **VPS / container**, build and run the standalone Next.js output:

```bash
bunx turbo build --filter=@envpilot/web
cd apps/web && bun run start        # or a process manager (pm2, systemd)
```

Put it behind a reverse proxy (Caddy/Nginx) with TLS on your domain.

### 7. Tier enforcement (pre-alpha toggle)

Feature tier-gating is enforced through the dynamic feature registry. The
**Tier Enforcement** admin toggle controls whether limits apply — with it OFF,
everything resolves to "allowed"/unlimited, which is the right default for a
private/internal instance. Turn it on if you want free/pro tiers.

## Updating your instance

```bash
git pull                # pull upstream changes
bun install
bunx convex deploy      # redeploy backend (re-runs seeds if wired in CI)
# redeploy the web app via your host
```

## Notes

- **The CLI and VS Code extension** are configured to talk to the public
  `envpilot.dev` backend by default (their WorkOS client id and Convex URL are
  baked in at build time). To point them at your instance, rebuild them with
  your own `WORKOS_CLIENT_ID` and `NEXT_PUBLIC_CONVEX_URL` — see
  `apps/cli` / `apps/vscode-extension` build scripts.
- **Secrets never touch the Convex database** — they live in WorkOS Vault. Keep
  your WorkOS credentials safe accordingly.
