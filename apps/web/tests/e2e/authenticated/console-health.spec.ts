import { test, expect } from "@playwright/test";

/**
 * Console-health regression guard for the error classes behind Sentry issues
 * ENVPILOT-J/K/P/N/1K (SSR/hydration failures on the dashboard routes) and
 * ENVPILOT-Y/X (Convex client fatal sync errors).
 *
 * Each route gets a FULL page load (SSR + hydration — client-side navigation
 * would not exercise the failure modes). The dashboard shell must mount with
 * no hydration mismatch, no auth-context error, and no Convex fatal error.
 *
 * Deliberately tolerated (same policy as auth-error-boundary.spec.ts): the
 * transient "Unauthenticated: no verified user identity" race on fresh
 * loads — it self-heals and AuthErrorBoundary auto-retries past it. What we
 * assert instead is that the shell actually finishes mounting (nav visible),
 * i.e. the race never STICKS. Unrelated console noise (asset 404s, devtools
 * chatter) is also not asserted on, to keep the spec stable.
 */

const ROUTES = ["/organizations", "/dashboard", "/dashboard/projects"];

const FAILURE_PATTERN =
  /hydration failed|hydrat(ing|ion) .*mismatch|switched to client rendering|useAuthContext must be used|\[CONVEX FATAL/i;

for (const route of ROUTES) {
  test(`full load of ${route} produces no hydration/auth console errors`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && FAILURE_PATTERN.test(msg.text())) {
        failures.push(msg.text().slice(0, 500));
      }
    });
    page.on("pageerror", (err) => {
      if (FAILURE_PATTERN.test(String(err))) {
        failures.push(String(err).slice(0, 500));
      }
    });

    await page.goto(route, { waitUntil: "load" });
    // Wait for the authenticated UI (sidebar) so hydration and the first
    // query round-trips have happened — and the transient auth race, if it
    // fired, has visibly self-healed — before asserting.
    await expect(page.locator("aside").first()).toBeVisible({
      timeout: 20_000,
    });
    // Console errors arrive asynchronously after render: settle on network
    // idle (websocket traffic doesn't count, so this resolves quickly on a
    // healthy run) plus a short fixed grace period.
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(1_000);

    expect(failures, failures.join("\n---\n")).toHaveLength(0);
  });
}
