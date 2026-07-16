# Setup

## Prerequisites

- [Bun](https://bun.sh/) v1.3.10+ (`curl -fsSL https://bun.sh/install | bash`)
- [Node.js](https://nodejs.org/) 20+ (required by some tooling)
- A [Convex](https://convex.dev/) project
- A [WorkOS](https://workos.com/) account (API key + Client ID)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/rafay99-epic/envpilot.dev.git
cd envpilot.dev

# Install dependencies
bun install

# Create environment files and symlinks
bun run setup

# Edit .env.local with your credentials (see below)

# Start development servers (Next.js + Convex)
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the web dashboard.

## Environment Variables

All env vars live in a single `.env.local` at the **monorepo root**. The web, blog, and docs apps read it via symlinks (e.g. `apps/web/.env.local → ../../.env.local`). Run `bun run setup` to create the file and symlinks automatically, then fill in the values.

See `.env.example` for the full template with descriptions.

### Required

| Variable                 | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL                          |
| `CONVEX_DEPLOYMENT`      | Convex deployment identifier                   |
| `WORKOS_API_KEY`         | WorkOS API key                                 |
| `WORKOS_CLIENT_ID`       | WorkOS client ID                               |
| `WORKOS_COOKIE_PASSWORD` | Cookie encryption key (32+ characters)         |
| `NEXT_PUBLIC_APP_URL`    | Application URL (e.g. `http://localhost:3000`) |
| `WORKOS_REDIRECT_URI`    | OAuth redirect URI                             |

### Optional

| Variable                          | Description                            |
| --------------------------------- | -------------------------------------- |
| `POLAR_ACCESS_TOKEN`              | Polar.sh access token                  |
| `POLAR_WEBHOOK_SECRET`            | Polar.sh webhook signing secret        |
| `NEXT_PUBLIC_PAYMENTS_ENABLED`    | Set `true` to enable billing           |
| `NEXT_PUBLIC_ENFORCE_TIER_LIMITS` | Set `true` to enforce tier caps        |
| `RESEND_API_KEY`                  | Resend API key for transactional email |
| `FROM_EMAIL`                      | Sender address for outbound email      |
