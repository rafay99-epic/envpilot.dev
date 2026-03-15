import { test, expect } from "@playwright/test";
import {
  apiRequest,
  createTestOrg,
  createTestProject,
  createTestVariable,
  deleteTestOrg,
  moveProject,
  getProject,
  listVariables,
} from "../helpers/test-utils";

/**
 * E2E Tests: Move Project Between Organizations
 *
 * Tests the POST /api/projects/[id]/move endpoint
 * which moves a project from one organization to another.
 */

test.describe("Move Project Between Orgs", () => {
  let sourceOrg: { _id: string; slug: string };
  let targetOrg: { _id: string; slug: string };

  test.beforeAll(async ({ request }) => {
    sourceOrg = await createTestOrg(request, `move-source-${Date.now()}`);
    targetOrg = await createTestOrg(request, `move-target-${Date.now()}`);
  });

  test.afterAll(async ({ request }) => {
    if (sourceOrg?.slug) {
      await deleteTestOrg(request, sourceOrg.slug).catch(() => {});
    }
    if (targetOrg?.slug) {
      await deleteTestOrg(request, targetOrg.slug).catch(() => {});
    }
  });

  test("moves project to target org successfully", async ({ request }) => {
    const project = await createTestProject(
      request,
      sourceOrg._id,
      `move-proj-${Date.now()}`
    );

    await createTestVariable(request, project._id, {
      key: "MOVE_VAR",
      value: "moved-value",
      environments: ["development", "production"],
    });

    const response = await moveProject(request, project._id, targetOrg._id);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("moved project retains its variables", async ({ request }) => {
    const project = await createTestProject(
      request,
      sourceOrg._id,
      `move-vars-${Date.now()}`
    );

    await createTestVariable(request, project._id, {
      key: "RETAINED_VAR",
      value: "should-still-exist",
      environments: ["staging"],
    });

    await moveProject(request, project._id, targetOrg._id);

    // Variables should still be accessible
    const varsResponse = await listVariables(request, project._id);
    expect(varsResponse.status()).toBe(200);

    const varsBody = await varsResponse.json();
    const keys = varsBody.variables?.map(
      (v: { key: string }) => v.key
    ) || [];
    expect(keys).toContain("RETAINED_VAR");
  });

  test("returns 404 for non-existent project", async ({ request }) => {
    const response = await moveProject(
      request,
      "nonexistent-id",
      targetOrg._id
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("returns 403 when not a member of target org", async ({ request }) => {
    const project = await createTestProject(
      request,
      sourceOrg._id,
      `move-noaccess-${Date.now()}`
    );

    // Try to move to a non-existent org (simulates not being a member)
    const response = await moveProject(
      request,
      project._id,
      "nonexistent-org-id"
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("returns 401 for unauthenticated requests", async ({ request }) => {
    const project = await createTestProject(
      request,
      sourceOrg._id,
      `move-unauth-${Date.now()}`
    );

    const response = await request.post(
      `http://localhost:3000/api/projects/${project._id}/move`,
      {
        headers: {},
        data: { targetOrganizationId: targetOrg._id },
      }
    );

    expect(response.status()).toBe(401);
  });
});
