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
  web: "1.31.0",
  cli: "1.13.0",
  extension: "1.8.0",
  // First builds that actually work post-auth-cutover: the pre-1.12.1 CLI and
  // pre-1.7.2 extension either use deleted token routes or shipped with an
  // empty embedded WorkOS client id, so both are unusable — block them.
  minCli: "1.12.1",
  minExtension: "1.7.2",
} as const;

export type AppVersions = typeof APP_VERSIONS;
