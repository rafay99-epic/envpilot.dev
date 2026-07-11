import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

// Authenticated e2e — Security Hold (suspend member access) UI wiring.
//
// The e2e account is a solo owner of its fixture org, and suspension targets
// a NON-owner member strictly below the actor. So the full suspend→reinstate
// round-trip needs a second member this suite cannot provision (invites
// require a real second human to accept). What IS driveable and worth
// guarding against regression:
//   - the members page renders under the real auth/role context;
//   - the owner's own row exposes NO suspend/reinstate control (self + owner
//     are both excluded — the two hard guards the backend also enforces);
//   - mounting the page exercises the AccessNotices queries (myTombstones,
//     getMyMembershipStatus) with no client error and no hold screen for an
//     active member.
// Deeper flows self-skip when the precondition (a suspendable member) is
// absent, per the suite convention.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("Security Hold — members page", () => {
  test("owner has no suspend control on their own row; no hold screen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    const orgSlug = await getOwnedOrgSlug(page);

    await page.goto(`/organizations/${orgSlug}/members`, {
      waitUntil: "domcontentloaded",
    });

    // Members list resolves after auth + membership context.
    await expect(
      page.getByRole("heading", { name: /Members \(/i }).first()
    ).toBeVisible({ timeout: 30_000 });

    // The active owner must NOT be shown the hold screen meant for a
    // suspended member.
    await expect(
      page.getByRole("heading", { name: /Your access has been revoked/i })
    ).toHaveCount(0);

    // Find the owner's own row (their email + the Owner badge) and assert it
    // carries neither a Suspend nor a Reinstate affordance — you can't
    // suspend yourself, and owners are never suspendable.
    const ownerRow = page
      .locator("div", { hasText: /owner/i })
      .filter({ has: page.getByText("@") })
      .first();

    // The suspend button is titled "Suspend access (security hold)"; the
    // reinstate control reads "Reinstate". Neither should exist for self/owner.
    await expect(
      page.getByRole("button", { name: /Suspend access \(security hold\)/i })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Reinstate$/ })).toHaveCount(
      0
    );

    // Sanity: the row actually rendered (guards against a false-negative where
    // the whole list failed to load and every count is trivially zero).
    await expect(ownerRow).toBeVisible();

    expect(
      clientErrors,
      `client errors on members page: ${clientErrors.join("; ")}`
    ).toHaveLength(0);
  });
});
