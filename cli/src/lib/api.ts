import { getApiUrl, getAccessToken, clearAuth } from "./config.js";
import type {
  ApiResponse,
  Organization,
  Project,
  Variable,
  User,
  TierInfo,
} from "../types/index.js";

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * API client for communicating with ENV Connect server
 */
export class APIClient {
  private baseUrl: string;
  private accessToken: string | undefined;

  constructor(options?: { baseUrl?: string; accessToken?: string }) {
    this.baseUrl = options?.baseUrl ?? getApiUrl();
    this.accessToken = options?.accessToken ?? getAccessToken();
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: this.getHeaders(),
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);

    const response = await fetch(url.toString(), {
      method: "PUT",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);

    const response = await fetch(url.toString(), {
      method: "PATCH",
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make a DELETE request
   */
  async delete(path: string): Promise<void> {
    const url = new URL(path, this.baseUrl);

    const response = await fetch(url.toString(), {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleError(response);
    }
  }

  /**
   * Handle API response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      await this.handleError(response);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const body = await response.text();
      const preview = body.replace(/\s+/g, " ").slice(0, 160);
      throw new APIError(
        `Expected JSON but got ${contentType || "unknown content type"} from ${response.url}. Response starts with: ${preview}`,
        response.status || 500,
      );
    }

    const body = await response.text();

    try {
      const data = JSON.parse(body);
      return data as T;
    } catch {
      const preview = body.replace(/\s+/g, " ").slice(0, 160);
      throw new APIError(
        `Failed to parse JSON response from ${response.url}. Response starts with: ${preview}`,
        response.status || 500,
      );
    }
  }

  /**
   * Handle API errors
   */
  private async handleError(response: Response): Promise<never> {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;

    try {
      const data = await response.json();
      message = data.error || data.message || message;
      code = data.code;
    } catch {
      // Ignore JSON parsing errors
    }

    // Handle authentication errors
    if (response.status === 401) {
      clearAuth();
      throw new APIError(
        "Authentication required. Please run `env-connect login`.",
        401,
        "UNAUTHORIZED",
      );
    }

    // Handle authorization errors
    if (response.status === 403) {
      throw new APIError(message || "Access denied.", 403, code || "FORBIDDEN");
    }

    // Handle tier limit errors
    if (response.status === 402) {
      throw new APIError(
        message || "Payment is currently disabled for this pre-alpha build.",
        402,
        "PAYMENT_REQUIRED",
      );
    }

    throw new APIError(message, response.status, code);
  }

  // ============================================
  // High-level API methods
  // ============================================

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<User> {
    return this.get<User>("/api/cli/auth/me");
  }

  /**
   * Get tier info for the active organization
   */
  async getTierInfo(organizationId: string): Promise<TierInfo> {
    return this.get<TierInfo>("/api/cli/tier", { organizationId });
  }

  /**
   * List organizations the user has access to
   */
  async listOrganizations(): Promise<Organization[]> {
    const response = await this.get<ApiResponse<Organization[]>>(
      "/api/cli/organizations",
    );
    return response.data || [];
  }

  /**
   * List projects in an organization
   */
  async listProjects(organizationId: string): Promise<Project[]> {
    const response = await this.get<ApiResponse<Project[]>>(
      "/api/cli/projects",
      { organizationId },
    );
    return response.data || [];
  }

  /**
   * Get a project by ID
   */
  async getProject(projectId: string): Promise<Project> {
    return this.get<Project>(`/api/cli/projects/${projectId}`);
  }

  /**
   * List variables in a project
   */
  async listVariables(
    projectId: string,
    environment?: string,
  ): Promise<Variable[]> {
    const params: Record<string, string> = { projectId };
    if (environment) {
      params.environment = environment;
    }
    const response = await this.get<ApiResponse<Variable[]>>(
      "/api/cli/variables",
      params,
    );
    return response.data || [];
  }

  /**
   * Get a variable by ID (with decrypted value)
   */
  async getVariable(variableId: string): Promise<Variable> {
    return this.get<Variable>(`/api/cli/variables/${variableId}`);
  }

  /**
   * Create a new variable
   */
  async createVariable(data: {
    projectId: string;
    key: string;
    value: string;
    environment: string;
    description?: string;
    isSensitive?: boolean;
  }): Promise<Variable> {
    return this.post<Variable>("/api/cli/variables", data);
  }

  /**
   * Update a variable
   */
  async updateVariable(
    variableId: string,
    data: {
      value?: string;
      description?: string;
      isSensitive?: boolean;
    },
  ): Promise<Variable> {
    return this.patch<Variable>(`/api/cli/variables/${variableId}`, data);
  }

  /**
   * Delete a variable
   */
  async deleteVariable(variableId: string): Promise<void> {
    return this.delete(`/api/cli/variables/${variableId}`);
  }

  /**
   * Bulk create/update variables
   */
  async bulkUpsertVariables(data: {
    projectId: string;
    environment: string;
    variables: Array<{
      key: string;
      value: string;
      description?: string;
      isSensitive?: boolean;
    }>;
    mode: "merge" | "replace";
  }): Promise<{ created: number; updated: number; deleted: number }> {
    return this.post("/api/cli/variables/bulk", data);
  }

  // ============================================
  // Authentication methods
  // ============================================

  /**
   * Initiate CLI authentication flow
   */
  async initiateAuth(
    deviceName: string,
  ): Promise<{ code: string; url: string; expiresAt: number }> {
    return this.post("/api/cli/auth/initiate", { deviceName });
  }

  /**
   * Poll for authentication status
   */
  async pollAuth(code: string): Promise<{
    status: "pending" | "authenticated" | "expired";
    accessToken?: string;
    refreshToken?: string;
    user?: User;
  }> {
    return this.get("/api/cli/auth/poll", { code });
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    return this.post("/api/cli/auth/refresh", { refreshToken });
  }

  /**
   * Revoke access token (logout)
   */
  async revokeToken(): Promise<void> {
    return this.post("/api/cli/auth/revoke", {});
  }
}

/**
 * Create a new API client with default config
 */
export function createAPIClient(): APIClient {
  return new APIClient();
}
