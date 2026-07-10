# Security TODO — Payments & Billing

Items to address before enabling Polar.sh payments in production.

## Critical

- [x] **Secure the `processWebhookEvent` trust boundary** — FIXED
      (fix/polar-production-hardening). The action stays public (the Next.js
      server has no Convex admin identity, so `internalAction` alone is not
      callable from it), but every call now requires a `bridgeSecret` argument
      checked constant-time against the `BILLING_WEBHOOK_BRIDGE_SECRET` Convex
      env var. Fail-closed: a deployment without the var refuses all billing
      events. Both callers (`/api/webhooks/polar`, `/api/billing/sync`) pass the
      secret from the same-named Next.js env var.
  - Deployment requirement: set `BILLING_WEBHOOK_BRIDGE_SECRET` (same value)
    in BOTH the web env (Vercel / .env.local) and the Convex deployment env
    (`bunx convex env set BILLING_WEBHOOK_BRIDGE_SECRET <value>`).

## Before Go-Live Checklist

- [x] Verify Polar.sh webhook signature validation in the Next.js route handler
      (Standard Webhooks via `@polar-sh/sdk/webhooks` `validateEvent`)
- [ ] Confirm `POLAR_WEBHOOK_SECRET` is set in production environment
- [ ] Confirm `BILLING_WEBHOOK_BRIDGE_SECRET` is set in production web env AND
      production Convex env (values must match)
- [ ] Seed the production Polar product id(s) into `paymentProducts` /
      `tierDefinitions.polarProductId` — activation events now HARD-FAIL on
      unmapped products (by design: Polar redelivers until seeded)
- [ ] Test full checkout flow end-to-end (checkout → webhook → tier sync)
- [ ] Test subscription cancellation flow (cancel → grace period → downgrade)
- [ ] Test tier upgrade/downgrade between paid tiers
- [x] Verify `prepareCheckout` mutation prevents duplicate active subscriptions
      (now scans all subscription rows, blocks live + cancel-at-period-end, and
      restricts purchase to the org's creating account — the identity the tier
      resolver reads)
- [ ] Load-test grace period expiry cron (`expireGracePeriods`)
