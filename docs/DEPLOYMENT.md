# Deployment Guide

This guide covers deploying ENV Connect to production environments.

## Deployment Overview

ENV Connect uses a modern JAMstack architecture:

- **Frontend**: Next.js deployed to Vercel (recommended) or any Node.js host
- **Backend**: Convex (managed real-time database)
- **Authentication**: WorkOS AuthKit (managed service)

## Prerequisites

Before deploying:

1. Production environment variables ready (see [Environment Setup](#environment-setup))
2. Convex production deployment configured
3. WorkOS production environment configured
4. (Optional) Custom domain configured

## Environment Setup

### Production Environment Variables

Set these environment variables in your hosting platform:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex production deployment URL | `https://your-app.convex.cloud` |
| `WORKOS_API_KEY` | WorkOS production API key | `sk_live_...` |
| `WORKOS_CLIENT_ID` | WorkOS client ID | `client_...` |
| `WORKOS_COOKIE_PASSWORD` | Secure cookie encryption key (32+ chars) | `<random-string>` |
| `NEXT_PUBLIC_APP_URL` | Production application URL | `https://your-domain.com` |

### Generate Secure Cookie Password

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Convex Production Deployment

### 1. Set Up Production Environment

```bash
# Login to Convex (if not already)
npx convex login

# Deploy to production
npx convex deploy
```

### 2. Get Production URL

After deployment, Convex provides your production URL:
```
Deployed to: https://your-app.convex.cloud
```

Use this as your `NEXT_PUBLIC_CONVEX_URL` in production.

### 3. Set Production Environment Variables

If your Convex functions need environment variables:

```bash
# Set environment variable in Convex production
npx convex env set VARIABLE_NAME value --prod
```

## Deploy to Vercel (Recommended)

Vercel is the recommended deployment platform for Next.js applications.

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Deploy

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### 3. Configure Environment Variables

In the Vercel dashboard:

1. Go to your project → **Settings** → **Environment Variables**
2. Add each production environment variable
3. Select **Production** environment (and Preview if desired)

Or via CLI:

```bash
vercel env add NEXT_PUBLIC_CONVEX_URL production
vercel env add WORKOS_API_KEY production
vercel env add WORKOS_CLIENT_ID production
vercel env add WORKOS_COOKIE_PASSWORD production
vercel env add NEXT_PUBLIC_APP_URL production
```

### 4. Connect Git Repository

For automatic deployments:

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Configure environment variables
4. Deploy

## Deploy to Other Platforms

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

Update `next.config.ts` for standalone output:

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
};
```

Build and run:

```bash
docker build -t env-connect .
docker run -p 3000:3000 --env-file .env.production env-connect
```

### Node.js / PM2 Deployment

```bash
# Build the application
npm run build

# Start with PM2
pm2 start npm --name "env-connect" -- start

# Or start directly
npm start
```

### AWS / Google Cloud / Azure

For cloud platforms, use their respective container or serverless services:

- **AWS**: Amplify, ECS, Lambda
- **Google Cloud**: Cloud Run, App Engine
- **Azure**: App Service, Container Apps

## WorkOS Production Setup

### 1. Create Production Environment

In WorkOS dashboard:

1. Go to **Environments**
2. Create or select **Production** environment
3. Copy the production API key (`sk_live_...`)

### 2. Configure Redirect URIs

Add your production redirect URI:

1. Go to **Authentication** → **AuthKit**
2. Add redirect URI: `https://your-domain.com/callback`
3. Remove any development URIs for security

### 3. Configure Sign-In Methods

Enable desired authentication methods:

- Email + Password
- Google OAuth
- GitHub OAuth
- SAML SSO (Enterprise)

## Custom Domain Setup

### Vercel

1. Go to project → **Settings** → **Domains**
2. Add your domain
3. Configure DNS records as instructed

### DNS Configuration

Add these records to your DNS provider:

```
Type    Name    Value
A       @       76.76.21.21 (Vercel IP)
CNAME   www     cname.vercel-dns.com
```

### SSL/TLS

Vercel and most platforms provide automatic SSL certificates. Ensure:

- All traffic redirects to HTTPS
- HSTS headers are enabled
- Certificate is valid and auto-renewing

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Production Convex deployment created
- [ ] WorkOS production environment configured
- [ ] Production redirect URIs added to WorkOS
- [ ] Secrets use production values (not test keys)

### Build Verification

- [ ] `npm run build` succeeds locally
- [ ] `npm run lint` passes
- [ ] E2E tests pass (`npm run test:e2e`)

### Post-Deployment

- [ ] Application loads correctly
- [ ] Authentication flow works
- [ ] Database connections succeed
- [ ] All features function correctly
- [ ] Performance monitoring enabled
- [ ] Error tracking configured

## Monitoring and Maintenance

### Health Checks

Add a health check endpoint:

```typescript
// src/app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'healthy', timestamp: Date.now() });
}
```

### Logging

- Use structured logging in production
- Configure log aggregation (Vercel Logs, Datadog, etc.)
- Set up alerts for errors

### Performance Monitoring

- Enable Vercel Analytics
- Use Web Vitals monitoring
- Set up uptime monitoring

### Database Management

```bash
# View Convex production logs
npx convex logs --prod

# Run production data queries (read-only recommended)
npx convex dashboard --prod
```

## Rollback Procedures

### Vercel

1. Go to **Deployments** tab
2. Find the previous working deployment
3. Click **...** → **Promote to Production**

### Convex

Convex maintains function history. To rollback:

```bash
# Re-deploy a previous version
git checkout <previous-commit>
npx convex deploy
```

## Security Considerations

### Environment Variables

- Never commit `.env.local` or production secrets
- Use platform secret management
- Rotate secrets periodically

### API Security

- All API routes validate authentication
- Rate limiting configured
- CORS properly configured

### Data Security

- Convex provides encryption at rest
- WorkOS handles authentication securely
- Sensitive data stored in WorkOS Vault

## Scaling

### Automatic Scaling

- Vercel: Automatic scaling included
- Convex: Automatic scaling included
- WorkOS: Managed service

### Manual Considerations

- Monitor Convex bandwidth and compute usage
- Review WorkOS MAU (Monthly Active Users) limits
- Optimize database queries for performance

## Troubleshooting

### Build Failures

```bash
# Check build logs
vercel logs

# Verify local build
npm run build
```

### Runtime Errors

```bash
# Check function logs
vercel logs --since 1h

# Check Convex logs
npx convex logs --prod
```

### Authentication Issues

1. Verify WorkOS keys are for production
2. Check redirect URI matches exactly
3. Ensure cookie password is set

## Related Documentation

- [Development Guide](./DEVELOPMENT.md) - Local development setup
- [Convex Deployment](https://docs.convex.dev/production) - Convex production docs
- [Vercel Deployment](https://vercel.com/docs) - Vercel documentation
- [WorkOS AuthKit](https://workos.com/docs/user-management) - WorkOS documentation
