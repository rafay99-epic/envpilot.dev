# Deployment Guide

This guide covers deploying ENV Connect to production environments.

## Architecture

- **Frontend**: Next.js deployed to Vercel (recommended) or any Node.js host
- **Backend**: Convex (managed real-time database)
- **Authentication**: WorkOS AuthKit (managed service)
- **Monorepo**: Turborepo with Bun workspaces

## Prerequisites

1. Production environment variables ready
2. Convex production deployment configured
3. WorkOS production environment configured

## Environment Variables

Set these in your hosting platform:

| Variable                 | Description                               |
| ------------------------ | ----------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Convex production deployment URL          |
| `WORKOS_API_KEY`         | WorkOS production API key (`sk_live_...`) |
| `WORKOS_CLIENT_ID`       | WorkOS client ID                          |
| `WORKOS_COOKIE_PASSWORD` | Secure cookie encryption key (32+ chars)  |
| `NEXT_PUBLIC_APP_URL`    | Production application URL                |

## Convex Deployment

```bash
# From repo root
cd convex && bun run deploy
```

## Vercel Deployment (Recommended)

1. Import your Git repository at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `apps/web`
3. Configure environment variables in project settings
4. Deploy

Vercel auto-detects the Next.js framework and handles builds.

### Vercel CLI

```bash
# Deploy to preview
cd apps/web && vercel

# Deploy to production
cd apps/web && vercel --prod
```

## Docker Deployment

```dockerfile
FROM oven/bun:1.2 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build:web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

Add `output: "standalone"` to `apps/web/next.config.ts` for Docker builds.

## CLI Publishing

```bash
# Build and publish to npm
cd apps/cli
bun run build
npm publish
```

## VS Code Extension Publishing

```bash
# Package as .vsix
bun run package:extension

# Publish to marketplace
cd apps/vscode-extension && vsce publish
```

## Build Verification Checklist

- [ ] `bun run build` succeeds (all 3 apps)
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run format:check` passes
- [ ] Production environment variables configured
- [ ] Convex production deployment created
- [ ] WorkOS production redirect URIs configured

## Monitoring

```bash
# View Convex production logs
bunx convex logs --prod

# View Convex production dashboard
bunx convex dashboard --prod
```

## Related Documentation

- [Development Guide](./DEVELOPMENT.md) - Local development setup
- [Convex Deployment](https://docs.convex.dev/production)
- [Vercel Deployment](https://vercel.com/docs)
- [WorkOS AuthKit](https://workos.com/docs/user-management)
