import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled cleanup jobs for Envpilot.
 *
 * These prevent database bloat by removing expired records that
 * would otherwise accumulate and slow down queries.
 */
const crons = cronJobs();

// Clean up expired CLI auth sessions every hour
crons.interval(
  "cleanup expired CLI sessions",
  { hours: 1 },
  internal.cliSessions.cleanupExpiredSessions
);

// Clean up expired project access tokens every hour
crons.interval(
  "cleanup expired project access",
  { hours: 1 },
  internal.projectAccess.cleanupExpired
);

// Clean up acknowledged/expired revocation events every hour
crons.interval(
  "cleanup revocation events",
  { hours: 1 },
  internal.permissionRevocationEvents.cleanup
);

// Clean up expired invitations every 6 hours
crons.interval(
  "cleanup expired invitations",
  { hours: 6 },
  internal.invitations.cleanupExpired
);

// Clean up expired variable permissions daily at 3:00 AM UTC
crons.daily(
  "cleanup expired permissions",
  { hourUTC: 3, minuteUTC: 0 },
  internal.permissions.cleanupExpired
);

// Expire grace periods and downgrade users whose grace has ended
crons.interval(
  "expire grace periods",
  { hours: 1 },
  internal.subscriptions.expireGracePeriods
);

// Process secret rotation expiry — transition statuses and send reminder emails
crons.interval(
  "process secret rotation expiry",
  { hours: 1 },
  internal.variables.processRotationExpiry
);

export default crons;
