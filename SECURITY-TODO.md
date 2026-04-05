# Security TODO — Payments & Billing

Items to address before enabling Polar.sh payments in production.

## Critical

- [ ] **Make `processWebhookEvent` internal** (`convex/subscriptions.ts:605`)
  - Currently a public `action` — anyone with the Convex URL can call it directly, bypassing Polar.sh signature verification
  - Change from `action` to `internalAction`
  - Have the Next.js webhook route call it via `internal.subscriptions.processWebhookEvent`
  - This prevents forged webhook events from manipulating tiers, grace periods, or usage counters

## Before Go-Live Checklist

- [ ] Verify Polar.sh webhook signature validation in the Next.js route handler
- [ ] Confirm `POLAR_WEBHOOK_SECRET` is set in production environment
- [ ] Test full checkout flow end-to-end (checkout → webhook → tier sync)
- [ ] Test subscription cancellation flow (cancel → grace period → downgrade)
- [ ] Test tier upgrade/downgrade between paid tiers
- [ ] Verify `prepareCheckout` mutation prevents duplicate active subscriptions
- [ ] Load-test grace period expiry cron (`expireGracePeriods`)
