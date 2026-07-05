// Build-time-injected constants.
//
// tsup replaces `__WORKOS_CLIENT_ID__` and `__CONVEX_URL__` with string
// literals at build time (see tsup.config.ts), mirroring the existing
// `__CLI_SENTRY_DSN__` / `__CLI_VERSION__` pattern. When the CLI is run from
// source during local development (e.g. via tsx, with no bundling step) the
// identifiers are undefined, so we fall back to the corresponding environment
// variables. The `typeof` guard is what makes the fallback safe: referencing an
// undeclared identifier would otherwise throw a ReferenceError.

declare const __WORKOS_CLIENT_ID__: string;
declare const __CONVEX_URL__: string;

/**
 * Public WorkOS AuthKit client id. Safe to embed in the shipped binary — it is
 * the same value the browser app exposes. Used for the device authorization
 * flow and token refresh.
 */
export const WORKOS_CLIENT_ID: string =
  typeof __WORKOS_CLIENT_ID__ !== "undefined" && __WORKOS_CLIENT_ID__
    ? __WORKOS_CLIENT_ID__
    : (process.env.WORKOS_CLIENT_ID ?? "");

/**
 * Convex deployment URL the CLI talks to directly for all non-vault data.
 * Baked at build time from `NEXT_PUBLIC_CONVEX_URL`.
 */
export const CONVEX_URL: string =
  typeof __CONVEX_URL__ !== "undefined" && __CONVEX_URL__
    ? __CONVEX_URL__
    : (process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
