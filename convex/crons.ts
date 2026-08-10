import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled cleanup jobs for Envpilot.
 *
 * These prevent database bloat by removing expired records that
 * would otherwise accumulate and slow down queries.
 */
const crons = cronJobs();

// Clean up expired project access tokens every hour
crons.interval(
  "cleanup expired project access",
  { hours: 1 },
  internal.features.users.projectAccess.cleanupExpired
);

// Clean up acknowledged/expired revocation events every hour
crons.interval(
  "cleanup revocation events",
  { hours: 1 },
  internal.features.permissions.revocationEvents.cleanup
);

// Clean up expired invitations every 6 hours
crons.interval(
  "cleanup expired invitations",
  { hours: 6 },
  internal.features.organizations.invitations.cleanupExpired
);

// Clean up expired variable permissions daily at 3:00 AM UTC
crons.daily(
  "cleanup expired permissions",
  { hourUTC: 3, minuteUTC: 0 },
  internal.features.permissions.variablePermissions.cleanup.cleanupExpired
);

// Clean up expired account permissions daily at 3:10 AM UTC
crons.daily(
  "cleanup expired account permissions",
  { hourUTC: 3, minuteUTC: 10 },
  internal.features.permissions.accountPermissions.mutations.cleanupExpired
);

// Expire grace periods and downgrade users whose grace has ended
crons.interval(
  "expire grace periods",
  { hours: 1 },
  internal.features.billing.gracePeriods.expireGracePeriods
);

// Process secret rotation expiry — transition statuses and send reminder emails
crons.interval(
  "process secret rotation expiry",
  { hours: 1 },
  internal.features.variables.rotation.processRotationExpiry
);

// Clean up expired shared secrets every hour
crons.interval(
  "cleanup expired shared secrets",
  { hours: 1 },
  internal.features.sharing.cleanup.cleanupExpiredShares
);

// Clean up stale OTP codes every 30 minutes
crons.interval(
  "cleanup expired share OTPs",
  { minutes: 30 },
  internal.features.sharing.cleanup.cleanupExpiredOtps
);

// Flip past-TTL documentation shares to "expired" every hour. Bookkeeping
// only — the read gate already refuses them, and the active-link count
// excludes them, so the cadence is not load-bearing.
crons.interval(
  "cleanup expired documentation shares",
  { hours: 1 },
  internal.features.docs.shareCleanup.cleanupExpiredDocShares
);

// Auto-publish scheduled changelog entries hourly. A marketing changelog
// entry going live up to ~55 minutes after its scheduledFor timestamp has
// no user-facing consequence — publishedAt is still set to the original
// scheduledFor value (see changelog.ts), so displayed ordering/dates are
// unaffected by the coarser cadence.
crons.interval(
  "publish scheduled changelog entries",
  { hours: 1 },
  internal.features.community.changelog.publish.publishScheduledEntries
);

// Clean up acknowledged membership tombstones (exit notices) after 30 days
crons.daily(
  "cleanup membership tombstones",
  { hourUTC: 3, minuteUTC: 20 },
  internal.features.organizations.tombstones.cleanupAcknowledged,
  {}
);

// Clean up processed webhook events older than 7 days. Pure table-bloat
// prevention with a 7-day retention window — no user-facing timing
// requirement, so daily is functionally identical to the previous 6h
// cadence at a quarter of the runs.
crons.interval(
  "cleanup processed webhook events",
  { hours: 24 },
  internal.features.billing.webhooks.cleanupProcessedWebhooks
);

// Reclaim deleted notification endpoints and any Vault object whose webhook
// metadata insert failed after encryption succeeded.
crons.interval(
  "cleanup notification webhook vault objects",
  { hours: 1 },
  internal.features.integrations.dispatch.cleanupVault,
  {}
);

// Retry notification deliveries retained after a transient scheduler failure.
crons.interval(
  "recover pending notification deliveries",
  { minutes: 1 },
  internal.features.integrations.queue.recoverPendingDeliveries,
  {}
);

crons.interval(
  "recover pending audit notifications",
  { minutes: 1 },
  internal.features.integrations.notify.recoverPendingNotifications,
  {}
);

// Auto-cancel machine-originated variable requests pending > 30 days —
// abandoned agent runs are routine and must not rot the reviewer feed.
crons.daily(
  "cancel stale machine variable requests",
  { hourUTC: 3, minuteUTC: 30 },
  internal.features.variables.requests.mutations.cancelStaleMachineRequests,
  {}
);

// Permanently purge trashed variables/accounts past the 7-day retention window
// — destroys their WorkOS Vault objects AND Convex rows. Runs after the 3:xx
// permission cleanups so it operates on freshly-settled state.
crons.daily(
  "purge expired trashed secrets",
  { hourUTC: 4, minuteUTC: 0 },
  internal.features.vault.gc.purgeExpiredBatch,
  {}
);

// Permanently delete trashed documentation past the same 7-day window. Not
// part of the vault sweep above: a doc has no Vault object and no blob, so
// it is two row deletes with no external calls.
crons.daily(
  "purge expired trashed docs",
  { hourUTC: 4, minuteUTC: 15 },
  internal.features.docs.gc.purgeExpiredDocs,
  {}
);

export default crons;
