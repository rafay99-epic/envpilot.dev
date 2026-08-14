/**
 * Whether a state-changing request came from this app's own origin.
 *
 * Browsers attach `Sec-Fetch-Site` to every request they originate, so a
 * forged submission from another site arrives as `cross-site`. Browsers that
 * predate Fetch Metadata still send `Origin` on a POST. A request carrying
 * neither header did not come from a browser and has no business driving a
 * user-intent flow, so it is refused.
 *
 * This is a CSRF check, not authentication — the caller still has to
 * authenticate the user.
 */
export function isSameOrigin(request: Request, appOrigin: string): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = request.headers.get("origin");
  if (origin) return origin === appOrigin;
  return false;
}
