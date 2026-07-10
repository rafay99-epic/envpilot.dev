/**
 * LEGACY CLIENT COMPAT SHIM — DO NOT ADD EXPORTS, DO NOT IMPORT FROM HERE.
 *
 * Published CLI (>= 1.14.0) / VS Code extension (>= 1.7.2) builds call
 * the function path(s) below by baked-in string refs. This shim keeps those
 * exact paths registered on the deployment. All monorepo code uses the real
 * feature paths.
 *
 * Removal: once the CLI/extension releases that use the features/* paths are
 * the minimum supported versions (minCli/minExtension in
 * apps/web/src/lib/versions.ts), delete this file.
 */

export { listWithAccess } from "./features/variables/queries";
