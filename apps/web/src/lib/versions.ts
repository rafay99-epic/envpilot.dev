/**
 * Single source of truth for current release versions, served by
 * `GET /api/version` and consumed by the web app, CLI, and VS Code extension.
 *
 * Two tiers per client surface:
 *  - `cli` / `extension` — the LATEST published version. Clients behind this
 *    show a soft "update available" notice but keep working.
 *  - `minCli` / `minExtension` — the MINIMUM SUPPORTED version. Clients below
 *    this are hard-blocked with an upgrade prompt, because older builds call
 *    server/Convex contracts that no longer exist and would fail confusingly.
 *
 * Bump `cli`/`extension` on every release. Bump `minCli`/`minExtension` only
 * when a release makes older clients genuinely incompatible (e.g. the Stage 2
 * device-flow auth cutover broke every pre-1.12.1 CLI / pre-1.7.2 extension).
 */
export const APP_VERSIONS = {
  web: "1.36.0",
  cli: "1.17.0",
  extension: "1.13.0",
  // First CLI build on the Stage 3 vault path: ≤1.13.x fetch secret values
  // via GET/POST /api/cli/variables{,/bulk}, REST routes DELETED when vault
  // crypto moved into Convex (PR #86). On those builds auth/identity commands
  // still work (direct-to-Convex since Stage 2) but `run`/`pull`/`push` fail
  // with a confusing "session not authorized" error instead of an upgrade
  // prompt — exactly the failure mode minCli exists to prevent. 1.14.0 is the
  // first published build using the pullValues Convex action.
  minCli: "1.14.0",
  // First extension build that works post-auth-cutover (Stage 2): pre-1.7.2
  // used deleted token routes / shipped an empty embedded WorkOS client id.
  minExtension: "1.7.2",
} as const;

export type AppVersions = typeof APP_VERSIONS;
