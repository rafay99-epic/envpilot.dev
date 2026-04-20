import * as core from "@actions/core";
import type { CompleteSessionRequest } from "./types.js";
import { STATE_KEYS } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPLETE_TIMEOUT_MS = 10_000;

// ─── Post-Job Cleanup ────────────────────────────────────────────────────────

/**
 * Post-job step that runs `always()` — even if the workflow job failed.
 *
 * Marks the CI/CD session as completed so Envpilot knows the pipeline run
 * is finished and the session token can be fully invalidated. If this call
 * fails (network error, timeout), the session will still expire automatically
 * via its TTL (5-10 minutes) or be cleaned up by the server-side cron.
 *
 * This is a best-effort operation — it should never cause the job to fail.
 */
async function post(): Promise<void> {
  const sessionId = core.getState(STATE_KEYS.SESSION_ID);
  const sessionToken = core.getState(STATE_KEYS.SESSION_TOKEN);
  const apiUrl = core.getState(STATE_KEYS.API_URL);
  const variablesAccessed = parseInt(
    core.getState(STATE_KEYS.VARIABLES_ACCESSED) || "0",
    10
  );

  // If no session was created (e.g., auth failed), nothing to clean up
  if (!sessionId || !sessionToken || !apiUrl) {
    core.debug("No active session to clean up — skipping post-job step");
    return;
  }

  // Mask the session token in logs
  core.setSecret(sessionToken);

  const url = `${apiUrl}/api/v1/cicd/sessions/${sessionId}/complete`;
  core.debug(`Completing session ${sessionId}...`);

  try {
    const body: CompleteSessionRequest = { variablesAccessed };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(COMPLETE_TIMEOUT_MS),
    });

    if (response.ok) {
      core.info(`Envpilot session ${sessionId} completed successfully`);
    } else {
      // Non-blocking: log but don't fail. Server-side TTL will handle expiry.
      core.warning(
        `Failed to complete session ${sessionId} (HTTP ${response.status}). ` +
          `The session will expire automatically via its TTL.`
      );
    }
  } catch (error) {
    // Non-blocking: network errors during cleanup should not fail the job
    const message = error instanceof Error ? error.message : String(error);
    core.warning(
      `Failed to complete session ${sessionId}: ${message}. ` +
        `The session will expire automatically via its TTL.`
    );
  }
}

post();
