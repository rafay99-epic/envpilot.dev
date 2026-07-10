import { expect, test } from "@playwright/test";
import { getOwnedOrgSlug } from "./support";

// Convex auth cutover — pins down the two halves of the identity model:
//
//  1. POSITIVE: the browser reaches real data through the authenticated
//     Convex WebSocket (ConvexProviderWithAuth + WorkOS AuthKit JWT). If the
//     JWT handshake regresses (auth.config.ts, token bridge, provider swap),
//     the organizations page renders nothing and this fails.
//  2. NEGATIVE: converted functions are unreachable without a verified
//     identity. Before the cutover, ANY caller could pass ANY `userId` to the
//     public deployment and impersonate that user; these probes fail if that
//     hole ever reopens (e.g. someone re-adds an actor arg or forgets
//     requireAuthedUser on a new function).
//
// The probes talk to the Convex deployment directly (NEXT_PUBLIC_CONVEX_URL)
// exactly like an attacker would — no session, no app middleware in the way.
// They create no data, so there is nothing to clean up.

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexQuery(
  request: import("@playwright/test").APIRequestContext,
  path: string,
  args: Record<string, unknown>
): Promise<{ status: string; errorMessage?: string }> {
  const response = await request.post(`${CONVEX_URL}/api/query`, {
    data: { path, args, format: "json" },
  });
  return (await response.json()) as {
    status: string;
    errorMessage?: string;
  };
}

test.describe("convex auth cutover", () => {
  test("authenticated browser loads org data over the Convex WebSocket", async ({
    page,
  }) => {
    // getOwnedOrgSlug drives the real /organizations page, whose cards come
    // from the converted organizations.listForUser query via useQuery — the
    // full JWT path: AuthKit session → token bridge → Convex WS → identity.
    const slug = await getOwnedOrgSlug(page);
    expect(slug.length).toBeGreaterThan(0);
  });

  test("tokenless direct Convex calls to converted functions are rejected", async ({
    request,
  }) => {
    test.skip(!CONVEX_URL, "NEXT_PUBLIC_CONVEX_URL not set");

    for (const path of [
      "features/organizations/queries:listForUser",
      "features/billing/queries:getOwn",
    ]) {
      const result = await convexQuery(request, path, {});
      expect(result.status, `${path} must reject tokenless callers`).toBe(
        "error"
      );
      expect(result.errorMessage).toContain("Unauthenticated");
    }
  });

  test("the impersonation arg is gone: passing userId is a validation error", async ({
    request,
  }) => {
    test.skip(!CONVEX_URL, "NEXT_PUBLIC_CONVEX_URL not set");

    // The pre-cutover attack: call a public function with someone else's
    // userId. The arg no longer exists, so Convex must reject it at the
    // validator layer — before any handler code runs.
    const result = await convexQuery(
      request,
      "features/organizations/queries:listForUser",
      {
        userId: "jd7f0000000000000000000000000000",
      }
    );
    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/Unauthenticated|ArgumentValidation/);
  });

  // NOTE: the old "ForToken variants reject unknown bearer tokens" probe was
  // removed — every `*ForToken` Convex function was deleted in the Stage 2
  // device-flow cutover (see convex/identity.ts). Probing a now-nonexistent
  // function only ever returns "Could not find function", so the test asserted
  // an impossible error string. The two probes above already pin the security
  // posture (tokenless + impersonation-arg rejection) for the surviving,
  // identity-scoped functions.
});
