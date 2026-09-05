/**
 * Every notification surface (Slack, Discord, email) builds its deep link
 * through this function, so "where does this audit action send a reviewer"
 * has exactly one answer.
 */
export function reviewPath(
  action: string,
  details: Record<string, unknown> | undefined,
  orgSlug: string | undefined
): string {
  const requestId = details?.requestId;
  if (typeof requestId === "string") {
    if (action.startsWith("change.")) {
      return `/dashboard/requests?change=${requestId}`;
    }
    if (action.startsWith("variable.request")) {
      return `/dashboard/requests?request=${requestId}`;
    }
  }
  return orgSlug ? `/organizations/${orgSlug}` : "/dashboard";
}
