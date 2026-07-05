import { WorkOS } from "@workos-inc/node";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/workos-sessions");

let workosClient: WorkOS | null = null;

function getWorkOS(): WorkOS | null {
  const apiKey = process.env.WORKOS_API_KEY;
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!apiKey || !clientId) return null;
  if (!workosClient) {
    workosClient = new WorkOS(apiKey, { clientId });
  }
  return workosClient;
}

/**
 * Revoke WorkOS sessions (device-flow CLI/extension logins) server-side so a
 * remote "sign out this device" is real: the device's refresh token stops
 * working and its ≤5-minute access token is the only remaining lifetime.
 *
 * Best-effort by design — the Convex device-session rows are already
 * deactivated by the calling mutation, so a WorkOS API hiccup must not fail
 * the user-facing revoke. Failures are logged for follow-up.
 */
export async function revokeWorkosSessions(
  sessionIds: Array<string | null | undefined>
): Promise<{ revoked: number; failed: number }> {
  const ids = sessionIds.filter((s): s is string => Boolean(s));
  if (ids.length === 0) return { revoked: 0, failed: 0 };

  const workos = getWorkOS();
  if (!workos) {
    log.warn("workos_not_configured_for_session_revoke", {
      count: ids.length,
    });
    return { revoked: 0, failed: ids.length };
  }

  let revoked = 0;
  let failed = 0;
  await Promise.all(
    ids.map(async (sessionId) => {
      try {
        await workos.userManagement.revokeSession({ sessionId });
        revoked++;
      } catch (error) {
        failed++;
        log.warn("workos_session_revoke_failed", {
          sessionId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    })
  );
  return { revoked, failed };
}
