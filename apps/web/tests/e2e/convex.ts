import type { APIRequestContext } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";

import "./env";

/**
 * Convex clients for the e2e suite.
 *
 * The dashboard talks to Convex directly, so fixtures and cleanup have to as
 * well: the REST adapters they used to drive are gone. Authorization is
 * identical either way, because this uses the SAME WorkOS access token the
 * browser puts on its Convex socket, obtained from the same `/api/auth/me`
 * bootstrap the app itself calls.
 *
 * That matters for what these helpers prove: a fixture created here goes
 * through every capability check a real user's would. Nothing here has
 * elevated privileges, and the deploy key is deliberately not used.
 */

function convexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set — the root .env.local is required " +
        "for e2e runs (see tests/e2e/env.ts)."
    );
  }
  return url;
}

/** Unauthenticated client, for public surfaces (share links, doc links). */
export function anonConvex(): ConvexHttpClient {
  return new ConvexHttpClient(convexUrl());
}

/**
 * Client bound to the signed-in fixture user.
 *
 * Fetches a fresh token per call rather than caching one: AuthKit rotates
 * access tokens, and a spec that runs long enough to outlive one would
 * otherwise fail with an auth error that looks nothing like its real cause.
 */
export async function authedConvex(
  request: APIRequestContext
): Promise<ConvexHttpClient> {
  const response = await request.get("/api/auth/me");
  if (!response.ok()) {
    throw new Error(
      `could not bootstrap a Convex token: GET /api/auth/me returned ` +
        `${response.status()} — is the saved auth session still valid?`
    );
  }
  const { accessToken } = (await response.json()) as {
    accessToken: string | null;
  };
  if (!accessToken) {
    throw new Error(
      "GET /api/auth/me returned no accessToken — the saved storage state " +
        "is signed out; re-run the auth setup project."
    );
  }
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(accessToken);
  return client;
}
