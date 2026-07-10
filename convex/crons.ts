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

// Clean up processed webhook events older than 7 days
crons.interval(
  "cleanup processed webhook events",
  { hours: 6 },
  internal.features.billing.webhooks.cleanupProcessedWebhooks
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

export default crons;
