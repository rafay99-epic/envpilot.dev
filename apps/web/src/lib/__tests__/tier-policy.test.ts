import { describe, expect, it } from "vitest";

import { TIER_CONFIGS } from "@convex/features/admin/migrations";

/**
 * The machine surfaces belong on the free tier.
 *
 * They were Pro-only, which meant the CLI, the editor extensions and the
 * JetBrains plugin were free while every surface an agent or a CI job can
 * reach was paid. Nobody could evaluate the agent workflow. Worse,
 * protected_environments is what turns an agent write into a change request a
 * human approves, so the feature that makes agent access safe was itself
 * behind the paywall.
 *
 * Flipping any of these back is a pricing decision, not a refactor, so it has
 * to fail here first.
 */
describe("free tier covers the machine surfaces", () => {
  const free = TIER_CONFIGS.free;

  it("enables every agent and CI surface", () => {
    expect(free.mcp_server).toBe("true");
    expect(free.public_api).toBe("true");
    expect(free.docker_image).toBe("true");
  });

  it("enables the approval loop that makes agent writes safe", () => {
    expect(free.protected_environments).toBe("true");
  });

  it("allows at least one key on each counted surface", () => {
    // The unit is active KEYS, not pulls (convex/lib/surfaces.ts). Zero meant
    // the boolean gate was on and no credential could be minted anyway.
    expect(Number(free.docker_image_limit)).toBeGreaterThan(0);
    expect(Number(free.github_action_limit)).toBeGreaterThan(0);
  });

  it("keeps the paid tier at least as capable as free", () => {
    for (const [key, freeValue] of Object.entries(free)) {
      if (freeValue !== "true") continue;
      expect(TIER_CONFIGS.pro[key], `pro.${key} is weaker than free`).toBe(
        "true"
      );
    }
  });

  it("still differentiates Pro on volume and retention", () => {
    expect(free.max_projects).not.toBe(TIER_CONFIGS.pro.max_projects);
    expect(Number(free.audit_log_retention_days)).toBeLessThan(
      Number(TIER_CONFIGS.pro.audit_log_retention_days)
    );
    expect(free.secret_rotation).toBe("false");
    expect(free.secret_sharing).toBe("false");
  });
});
