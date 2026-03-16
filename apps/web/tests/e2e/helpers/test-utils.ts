import { test as base, expect, type APIRequestContext } from "@playwright/test";

/**
 * E2E Test Utilities for Envpilot
 *
 * These helpers provide authenticated API access for integration testing.
 * Tests hit the API routes directly (no browser UI) to test backend logic.
 *
 * Note: Tests require the dev server running (`bun run dev:web`)
 * and valid auth credentials in the environment.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * Makes an authenticated API request.
 * Uses the test auth cookie from environment.
 */
export async function apiRequest(
  request: APIRequestContext,
  method: string,
  path: string,
  options?: {
    data?: Record<string, unknown>;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  }
) {
  const url = new URL(path, BASE_URL);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const requestOptions: Record<string, unknown> = {
    headers: {
      "Content-Type": "application/json",
      Cookie: process.env.TEST_AUTH_COOKIE || "",
      ...options?.headers,
    },
  };

  if (options?.data) {
    requestOptions.data = options.data;
  }

  switch (method.toUpperCase()) {
    case "GET":
      return request.get(url.toString(), requestOptions);
    case "POST":
      return request.post(url.toString(), requestOptions);
    case "PATCH":
      return request.patch(url.toString(), requestOptions);
    case "DELETE":
      return request.delete(url.toString(), requestOptions);
    case "PUT":
      return request.put(url.toString(), requestOptions);
    default:
      throw new Error(`Unsupported HTTP method: ${method}`);
  }
}

/**
 * Creates a test organization via the API
 */
export async function createTestOrg(request: APIRequestContext, name?: string) {
  const orgName = name || `test-org-${Date.now()}`;
  const slug = orgName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const response = await apiRequest(request, "POST", "/api/organizations", {
    data: { name: orgName, slug, description: "E2E test organization" },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return data.organization;
}

/**
 * Creates a test project in an organization
 */
export async function createTestProject(
  request: APIRequestContext,
  organizationId: string,
  name?: string
) {
  const projectName = name || `test-project-${Date.now()}`;
  const slug = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const response = await apiRequest(request, "POST", "/api/projects", {
    data: {
      name: projectName,
      slug,
      description: "E2E test project",
      organizationId,
    },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return data.project;
}

/**
 * Creates a test environment variable in a project
 */
export async function createTestVariable(
  request: APIRequestContext,
  projectId: string,
  options: {
    key: string;
    value: string;
    environments: ("development" | "staging" | "production")[];
    isSensitive?: boolean;
    description?: string;
  }
) {
  const response = await apiRequest(request, "POST", "/api/variables", {
    data: {
      projectId,
      key: options.key,
      value: options.value,
      environments: options.environments,
      isSensitive: options.isSensitive ?? false,
      description: options.description,
    },
  });

  expect(response.status()).toBeLessThan(300);
  const data = await response.json();
  return data.variable || data;
}

/**
 * Deletes a test organization (cleanup)
 */
export async function deleteTestOrg(request: APIRequestContext, slug: string) {
  const response = await apiRequest(
    request,
    "DELETE",
    `/api/organizations/${slug}`
  );
  return response;
}

/**
 * Deletes a test project (cleanup)
 */
export async function deleteTestProject(
  request: APIRequestContext,
  projectId: string
) {
  const response = await apiRequest(
    request,
    "DELETE",
    `/api/projects/${projectId}`
  );
  return response;
}

/**
 * Gets a project by ID
 */
export async function getProject(
  request: APIRequestContext,
  projectId: string
) {
  return apiRequest(request, "GET", `/api/projects/${projectId}`);
}

/**
 * Gets an organization by slug
 */
export async function getOrganization(
  request: APIRequestContext,
  slug: string
) {
  return apiRequest(request, "GET", `/api/organizations/${slug}`);
}

/**
 * Lists variables for a project
 */
export async function listVariables(
  request: APIRequestContext,
  projectId: string,
  environment?: string
) {
  const params: Record<string, string> = { projectId };
  if (environment) {
    params.environment = environment;
  }
  return apiRequest(request, "GET", "/api/variables", { params });
}

/**
 * Exports variables for a project
 */
export async function exportVariables(
  request: APIRequestContext,
  projectId: string,
  options?: {
    environment?: string;
    format?: "env" | "json";
  }
) {
  const params: Record<string, string> = {};
  if (options?.environment) {
    params.environment = options.environment;
  }
  if (options?.format) {
    params.format = options.format;
  }
  return apiRequest(request, "GET", `/api/projects/${projectId}/export`, {
    params,
  });
}

/**
 * Moves a project to another organization
 */
export async function moveProject(
  request: APIRequestContext,
  projectId: string,
  targetOrganizationId: string
) {
  return apiRequest(request, "POST", `/api/projects/${projectId}/move`, {
    data: { targetOrganizationId },
  });
}

/**
 * Transfers organization ownership
 */
export async function transferOrganization(
  request: APIRequestContext,
  orgSlug: string,
  targetUserEmail: string
) {
  return apiRequest(request, "POST", `/api/organizations/${orgSlug}/transfer`, {
    data: { targetUserEmail },
  });
}

export { base as test, expect };
