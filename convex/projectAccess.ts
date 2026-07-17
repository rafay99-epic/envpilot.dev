/**
 * LEGACY CLIENT COMPAT SHIM — DO NOT ADD EXPORTS, DO NOT IMPORT FROM HERE.
 *
 * Published VS Code extension builds (1.7.2 – 1.13.0) call these function
 * paths by baked-in string refs. The PR #95 backend refactor moved the module
 * to features/users/projectAccess without shimming it, which silently broke
 * extension link/unlink and the projectAccess real-time subscription in
 * production. This shim restores those exact paths.
 *
 * Removal: once the extension release that uses the features/* paths is the
 * minimum supported version (minExtension in apps/web/src/lib/versions.ts),
 * delete this file.
 */

export { linkExtension } from "./features/users/projectAccess";
export { unlinkExtension } from "./features/users/projectAccess";
export { listForCaller } from "./features/users/projectAccess";
