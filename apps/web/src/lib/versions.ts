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
  web: "1.59.4",
  cli: "1.20.0",
  extension: "1.17.0",
  // Registry-native floors: 1.18.0 (CLI) / 1.15.0 (extension) are the first
  // builds that call the real features/* Convex paths and consume
  // capability-driven role metadata. Everything below called the legacy root
  // shim paths (convex/<module>.ts), DELETED in the same release that set
  // these floors — older builds would fail with "function not found" instead
  // of an upgrade prompt, exactly what min versions exist to prevent.
  minCli: "1.18.0",
  minExtension: "1.15.0",
} as const;

export type AppVersions = typeof APP_VERSIONS;
