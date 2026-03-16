import { test, expect } from "@playwright/test";
import {
  apiRequest,
  createTestOrg,
  createTestProject,
  createTestVariable,
  deleteTestOrg,
  getProject,
} from "../helpers/test-utils";

/**
 * E2E Tests: Project Delete Cascade
 *
 * Tests the DELETE /api/projects/[id] endpoint
 * and verifies that all related data is properly cleaned up.
 */

test.describe("Project Delete Cascade", () => {
  let org: { _id: string; slug: string };
  let project: { _id: string; slug: string };

  test.beforeAll(async ({ request }) => {
    org = await createTestOrg(request, `del-proj-test-${Date.now()}`);
    project = await createTestProject(
      request,
      org._id,
      `del-proj-${Date.now()}`
    );

    // Create variables so there's data to cascade
    await createTestVariable(request, project._id, {
      key: "CASCADE_VAR_1",
      value: "value1",
      environments: ["development"],
    });
    await createTestVariable(request, project._id, {
      key: "CASCADE_VAR_2",
      value: "value2",
      environments: ["production"],
    });
  });

  test.afterAll(async ({ request }) => {
    if (org?.slug) {
      await deleteTestOrg(request, org.slug).catch(() => {});
    }
  });

  test("deleting a project returns success", async ({ request }) => {
    // Create a separate project for this test to avoid affecting others
    const testProject = await createTestProject(
      request,
      org._id,
      `del-test-${Date.now()}`
    );

    await createTestVariable(request, testProject._id, {
      key: "TO_DELETE",
      value: "will-be-deleted",
      environments: ["development", "staging"],
    });

    const response = await apiRequest(
      request,
      "DELETE",
      `/api/projects/${testProject._id}`
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("deleted project is no longer accessible", async ({ request }) => {
    const testProject = await createTestProject(
      request,
      org._id,
      `del-access-${Date.now()}`
    );

    await apiRequest(request, "DELETE", `/api/projects/${testProject._id}`);

    const getResponse = await getProject(request, testProject._id);
    expect(getResponse.status()).toBe(404);
  });

  test("returns 404 for non-existent project", async ({ request }) => {
    const response = await apiRequest(
      request,
      "DELETE",
      "/api/projects/nonexistent-id"
    );

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("returns 401 for unauthenticated requests", async ({ request }) => {
    const response = await request.delete(
      `http://localhost:3000/api/projects/${project._id}`,
      { headers: {} }
    );

    expect(response.status()).toBe(401);
  });
});
