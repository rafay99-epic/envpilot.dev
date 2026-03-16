import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  apiRequest,
  createTestOrg,
  createTestProject,
  createTestVariable,
  deleteTestOrg,
  exportVariables,
} from "../helpers/test-utils";

/**
 * E2E Tests: Variable Export API
 *
 * Tests the GET /api/projects/[id]/export endpoint
 * which exports environment variables as .env or .json files.
 */

test.describe("Variable Export API", () => {
  let org: { _id: string; slug: string };
  let project: { _id: string; slug: string };

  test.beforeAll(async ({ request }) => {
    // Create test org and project
    org = await createTestOrg(request, `export-test-${Date.now()}`);
    project = await createTestProject(
      request,
      org._id,
      `export-proj-${Date.now()}`
    );

    // Create variables across different environments
    await createTestVariable(request, project._id, {
      key: "VAR_DEV",
      value: "dev-value",
      environments: ["development"],
    });
    await createTestVariable(request, project._id, {
      key: "VAR_STAGING",
      value: "staging-value",
      environments: ["staging"],
    });
    await createTestVariable(request, project._id, {
      key: "VAR_PROD",
      value: "prod-value",
      environments: ["production"],
    });
    await createTestVariable(request, project._id, {
      key: "VAR_ALL",
      value: "all-env-value",
      environments: ["development", "staging", "production"],
    });
  });

  test.afterAll(async ({ request }) => {
    if (org?.slug) {
      await deleteTestOrg(request, org.slug);
    }
  });

  test("exports development variables as .env", async ({ request }) => {
    const response = await exportVariables(request, project._id, {
      environment: "development",
      format: "env",
    });

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("text/plain");

    const disposition = response.headers()["content-disposition"];
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("development.env");

    const body = await response.text();
    expect(body).toContain("VAR_DEV=");
    expect(body).toContain("VAR_ALL=");
    expect(body).not.toContain("VAR_STAGING=");
    expect(body).not.toContain("VAR_PROD=");
  });

  test("exports production variables as .json", async ({ request }) => {
    const response = await exportVariables(request, project._id, {
      environment: "production",
      format: "json",
    });

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/json");

    const body = await response.json();
    expect(body).toHaveProperty("VAR_PROD");
    expect(body).toHaveProperty("VAR_ALL");
    expect(body).not.toHaveProperty("VAR_DEV");
    expect(body).not.toHaveProperty("VAR_STAGING");
  });

  test("exports all environments when no filter", async ({ request }) => {
    const response = await exportVariables(request, project._id, {
      format: "env",
    });

    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain("VAR_DEV=");
    expect(body).toContain("VAR_STAGING=");
    expect(body).toContain("VAR_PROD=");
    expect(body).toContain("VAR_ALL=");
  });

  test("exports staging variables as .json", async ({ request }) => {
    const response = await exportVariables(request, project._id, {
      environment: "staging",
      format: "json",
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("VAR_STAGING");
    expect(body).toHaveProperty("VAR_ALL");
    expect(body).not.toHaveProperty("VAR_DEV");
    expect(body).not.toHaveProperty("VAR_PROD");
  });

  test("returns 401 for unauthenticated requests", async ({ request }) => {
    const response = await request.get(
      `http://localhost:3000/api/projects/${project._id}/export?format=env`,
      { headers: {} }
    );

    expect(response.status()).toBe(401);
  });

  test("returns 404 for non-existent project", async ({ request }) => {
    const response = await exportVariables(request, "nonexistent-id", {
      format: "env",
    });

    // Should return 404 or 400 for invalid project ID
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("env format uses KEY=value line format", async ({ request }) => {
    const response = await exportVariables(request, project._id, {
      environment: "development",
      format: "env",
    });

    const body = await response.text();
    const lines = body
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"));

    for (const line of lines) {
      // Each line should match KEY=value pattern
      expect(line).toMatch(/^[A-Z_][A-Z0-9_]*=.*/);
    }
  });
});
