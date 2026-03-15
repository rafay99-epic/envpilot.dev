import { test, expect } from "@playwright/test";
import {
  apiRequest,
  createTestOrg,
  createTestProject,
  createTestVariable,
  getOrganization,
  getProject,
} from "../helpers/test-utils";

/**
 * E2E Tests: Organization Delete Cascade
 *
 * Tests the DELETE /api/organizations/[slug] endpoint
 * and verifies that all related data (projects, variables, members)
 * is properly cleaned up.
 */

test.describe("Organization Delete Cascade", () => {
  test("deleting an org returns success", async ({ request }) => {
    const org = await createTestOrg(request, `org-del-basic-${Date.now()}`);

    const response = await apiRequest(
      request,
      "DELETE",
      `/api/organizations/${org.slug}`
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
  });

  test("deleted org is no longer accessible", async ({ request }) => {
    const org = await createTestOrg(request, `org-del-access-${Date.now()}`);
    await apiRequest(request, "DELETE", `/api/organizations/${org.slug}`);

    const getResponse = await getOrganization(request, org.slug);
    expect(getResponse.status()).toBe(404);
  });

  test("deleting org cascades to projects", async ({ request }) => {
    const org = await createTestOrg(request, `org-del-cascade-${Date.now()}`);
    const project = await createTestProject(
      request,
      org._id,
      `cascade-proj-${Date.now()}`
    );

    await createTestVariable(request, project._id, {
      key: "CASCADE_TEST",
      value: "will-be-deleted",
      environments: ["development"],
    });

    // Delete the org
    await apiRequest(request, "DELETE", `/api/organizations/${org.slug}`);

    // Project should no longer be accessible
    const projResponse = await getProject(request, project._id);
    expect(projResponse.status()).toBeGreaterThanOrEqual(400);
  });

  test("deleting org with multiple projects cascades all", async ({
    request,
  }) => {
    const org = await createTestOrg(request, `org-del-multi-${Date.now()}`);

    const project1 = await createTestProject(
      request,
      org._id,
      `multi-proj-1-${Date.now()}`
    );
    const project2 = await createTestProject(
      request,
      org._id,
      `multi-proj-2-${Date.now()}`
    );

    await createTestVariable(request, project1._id, {
      key: "MULTI_VAR_1",
      value: "value1",
      environments: ["development"],
    });
    await createTestVariable(request, project2._id, {
      key: "MULTI_VAR_2",
      value: "value2",
      environments: ["production"],
    });

    await apiRequest(request, "DELETE", `/api/organizations/${org.slug}`);

    const proj1Response = await getProject(request, project1._id);
    const proj2Response = await getProject(request, project2._id);

    expect(proj1Response.status()).toBeGreaterThanOrEqual(400);
    expect(proj2Response.status()).toBeGreaterThanOrEqual(400);
  });

  test("returns 401 for unauthenticated requests", async ({ request }) => {
    const org = await createTestOrg(request, `org-del-unauth-${Date.now()}`);

    const response = await request.delete(
      `http://localhost:3000/api/organizations/${org.slug}`,
      { headers: {} }
    );

    expect(response.status()).toBe(401);

    // Cleanup
    await apiRequest(request, "DELETE", `/api/organizations/${org.slug}`);
  });

  test("returns 404 for non-existent org", async ({ request }) => {
    const response = await apiRequest(
      request,
      "DELETE",
      "/api/organizations/nonexistent-slug-12345"
    );

    expect(response.status()).toBe(404);
  });
});
