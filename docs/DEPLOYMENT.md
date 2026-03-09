# Deployment Guide

This guide covers deploying ENV Connect to production.

## Architecture

- **Web App** -- Next.js deployed to Vercel (recommended) or any Node.js host
- **Backend** -- Convex (managed real-time database, auto-scaling)
- **Auth** -- WorkOS AuthKit (managed service)
- **Secrets** -- WorkOS Vault (managed encryption)
- **Billing** -- Stripe

## Prerequisites

1. Production environment variables ready
2. Convex production deployment configured
3. WorkOS production environment configured
4. (Optional) Stripe production keys

## Environment Variables

Set these in your hosting platform:

| Variable                             | Description                       | Example                         |
| ------------------------------------ | --------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`             | Convex production URL             | `https://your-app.convex.cloud` |
| `WORKOS_API_KEY`                     | WorkOS production API key         | `sk_live_...`                   |
| `WORKOS_CLIENT_ID`                   | WorkOS client ID                  | `client_...`                    |
| `WORKOS_COOKIE_PASSWORD`             | Cookie encryption key (32+ chars) | `<random-string>`               |
| `NEXT_PUBLIC_APP_URL`                | Production URL                    | `https://your-domain.com`       |
| `STRIPE_SECRET_KEY`                  | Stripe production key             | `sk_live_...`                   |
| `STRIPE_WEBHOOK_SECRET`              | Stripe webhook secret             | `whsec_...`                     |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key            | `pk_live_...`                   |
| `RESEND_API_KEY`                     | Resend email API key              | `re_...`                        |

Generate a secure cookie password:

```bash
openssl rand -base64 32
```

## Deploy Convex Backend

```bash
# Log in to Convex
bunx convex login

# Deploy functions to production
cd convex && bun run deploy
```

After deployment, Convex provides your production URL for `NEXT_PUBLIC_CONVEX_URL`.

Set Convex environment variables if needed:

```bash
bunx convex env set VARIABLE_NAME value --prod
```

## Deploy Web App to Vercel (Recommended)

### Via CLI

```bash
# Install Vercel CLI
bun add -g vercel

# Build the web app
cd apps/web && bun run build

# Deploy
vercel --prod
```

**Important:** Set the root directory to `apps/web` in Vercel project settings, or use the `--cwd` flag.

### Via Git Integration

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Set **Root Directory** to `apps/web`
4. Set **Build Command** to `cd ../.. && bun run build --filter=@env-connect/web`
5. Set **Output Directory** to `.next`
6. Add environment variables
7. Deploy

### Environment Variables in Vercel

```bash
vercel env add NEXT_PUBLIC_CONVEX_URL production
vercel env add WORKOS_API_KEY production
vercel env add WORKOS_CLIENT_ID production
vercel env add WORKOS_COOKIE_PASSWORD production
vercel env add NEXT_PUBLIC_APP_URL production
```

## Deploy Web App with Docker

Create a `Dockerfile` in `apps/web/`:

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN cd apps/web && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static

EXPOSE 3000
CMD ["bun", "server.js"]
```

Add `output: "standalone"` to `apps/web/next.config.ts` for Docker builds.

```bash
docker build -t env-connect .
docker run -p 3000:3000 --env-file .env.production env-connect
```

## Publish CLI

The CLI is published as `@env-connect/cli` on npm:

```bash
cd apps/cli
bun run build
npm publish --access public
```

Users install with: `npm install -g @env-connect/cli` or `bunx @env-connect/cli`

## Publish VS Code Extension

```bash
cd apps/vscode-extension

# Package
bun run package
bunx @vscode/vsce package

# Publish to VS Code Marketplace
bunx @vscode/vsce publish
```

## WorkOS Production Setup

1. In WorkOS dashboard, go to **Environments** > **Production**
2. Copy the production API key (`sk_live_...`)
3. Go to **Authentication** > **AuthKit**
4. Add production redirect URI: `https://your-domain.com/callback`
5. Enable desired sign-in methods
6. Remove development URIs for security

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured in hosting platform
- [ ] Convex production deployment created (`cd convex && bun run deploy`)
- [ ] WorkOS production environment configured
- [ ] Production redirect URIs added to WorkOS
- [ ] Stripe webhooks configured for production URL
- [ ] Resend domain verified (if using email features)

### Build Verification

```bash
bun run build        # All 3 apps build successfully
bun run lint         # No lint errors
bun run typecheck    # No type errors
bun run test:e2e     # E2E tests pass
```

### Post-Deployment

- [ ] Web app loads at production URL
- [ ] Authentication flow works end-to-end
- [ ] Convex database connections succeed
- [ ] Variable sync works (create, read, update, delete)
- [ ] Billing checkout works (if applicable)
- [ ] CLI can authenticate and pull/push variables
- [ ] VS Code extension can authenticate and sync

## Monitoring

### Convex

```bash
# View production logs
bunx convex logs --prod

# Open production dashboard
bunx convex dashboard --prod
```

### Vercel

```bash
vercel logs
vercel logs --since 1h
```

## Rollback

### Vercel

1. Go to **Deployments** tab
2. Find the previous working deployment
3. Click **...** > **Promote to Production**

### Convex

```bash
git checkout <previous-commit>
cd convex && bun run deploy
```

## Related Docs

- [Development Guide](./DEVELOPMENT.md) -- Local development setup
- [Convex Production Docs](https://docs.convex.dev/production)
- [Vercel Docs](https://vercel.com/docs)
- [WorkOS AuthKit Docs](https://workos.com/docs/user-management)
