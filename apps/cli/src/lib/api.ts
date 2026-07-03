import {
  getApiUrl,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearAuth,
} from "./config.js";
import type {
  ApiResponse,
  Organization,
  Project,
  Variable,
  User,
  TierInfo,
  UsageInfo,
  VariableRequest,
  VariableRequestStatus,
} from "../types/index.js";
import type { CreateVariableRequestBody } from "./variable-requests.js";

/**
 * Return the registrable domain (eTLD+1 approximation) for a hostname.
 * For hostnames like `envpilot.dev` or `www.envpilot.dev` this returns
 * `envpilot.dev`. This is a heuristic — we only use it to decide whether
 * a redirect is "same site" and thus safe to re-issue with Authorization.
 */
function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

const MAX_MANUAL_REDIRECTS = 5;

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * API client for communicating with Envpilot server
 */
export class APIClient {
  private baseUrl: string;
  private accessToken: string | undefined;
  // Re-entrancy guard: true while a token refresh is in flight so a 401 from
  // the refresh endpoint itself can never trigger another refresh (no loops).
  private refreshing = false;

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
   * Detect auth middleware redirects that returned HTML instead of CLI JSON.
   */
  private isAuthRedirect(response: Response, bodyText?: string): boolean {
    const location = response.headers.get("location") || "";
    const finalUrl = response.url || "";
    const contentType = response.headers.get("content-type") || "";
    const preview = (bodyText || "").slice(0, 512).toLowerCase();

    return (
      location.includes("authkit") ||
      finalUrl.includes("authkit") ||
      (contentType.includes("text/html") &&
        (preview.includes("authorization_session_id") ||
          preview.includes("client_id=") ||
          preview.includes("<!doctype html")))
    );
  }

  /**
   * Perform a fetch that follows 3xx redirects manually, re-attaching the
   * Authorization header when the redirect stays inside the same registrable
   * domain (eTLD+1). This defends against the apex→www redirect case where
   * Node's default redirect follower drops the Authorization header on any
   * hostname change and the resulting request comes back as a bogus 401 —
   * which used to wipe the user's credentials.
   *
   * Cross-site redirects (different registrable domain) are followed without
   * the Authorization header, matching browser/fetch security semantics.
   */
  private async fetchWithSafeRedirects(
    initialUrl: string,
    init: RequestInit
  ): Promise<Response> {
    let currentUrl = initialUrl;
    let currentInit: RequestInit = { ...init, redirect: "manual" };

    for (let hop = 0; hop < MAX_MANUAL_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, currentInit);

      // Not a redirect — return as-is
      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      const location = response.headers.get("location");
      if (!location) return response;

      const nextUrl = new URL(location, currentUrl);
      const prevHost = new URL(currentUrl).hostname;
      const sameSite =
        registrableDomain(nextUrl.hostname) === registrableDomain(prevHost);

      const headers = new Headers(currentInit.headers);
      if (!sameSite) {
        // Cross-site redirect — strip credentials (matches fetch spec)
        headers.delete("Authorization");
      }

      // 303 and (per spec) most 302/301 redirects coerce POST/PUT/PATCH to
      // GET and drop the body. 307 and 308 preserve method and body.
      let nextMethod = (currentInit.method || "GET").toUpperCase();
      let nextBody = currentInit.body;
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303
      ) {
        if (nextMethod !== "GET" && nextMethod !== "HEAD") {
          nextMethod = "GET";
          nextBody = undefined;
          headers.delete("Content-Type");
        }
      }

      currentUrl = nextUrl.toString();
      currentInit = {
        ...currentInit,
        method: nextMethod,
        headers,
        body: nextBody,
        redirect: "manual",
      };
    }

    throw new APIError(
      `Too many redirects while calling ${initialUrl}`,
      0,
      "TOO_MANY_REDIRECTS"
    );
  }

  /**
   * Attempt a one-shot access-token refresh using the stored refresh token.
   * Persists the rotated tokens and updates this client's in-memory token on
   * success. Returns false (without throwing) when there is no refresh token,
   * a refresh is already in flight, or the refresh call fails — the caller
   * then treats the session as dead.
   */
  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshing) return false;
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    this.refreshing = true;
    try {
      const result = await this.refreshToken(refreshToken);
      setAccessToken(result.accessToken);
      setRefreshToken(result.refreshToken);
      this.accessToken = result.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      this.refreshing = false;
    }
  }

  /**
   * Run a request thunk with automatic one-shot token refresh on a genuine 401.
   *
   * - An AUTH_REDIRECT (HTML sign-in page) is NOT a rejected token — rethrow
   *   without clearing creds or refreshing.
   * - A genuine 401 triggers a single refresh attempt. On success the request
   *   is retried once with the rotated token; on failure (or a second 401) the
   *   local credentials are cleared so the user is prompted to log in again.
   *
   * The thunk rebuilds its headers on each call, so the retry automatically
   * picks up the refreshed access token.
   */
  private async withAuthRetry<T>(exec: () => Promise<T>): Promise<T> {
    try {
      return await exec();
    } catch (err) {
      if (
        !(err instanceof APIError) ||
        err.statusCode !== 401 ||
        err.code === "AUTH_REDIRECT" ||
        this.refreshing
      ) {
        throw err;
      }

      const refreshed = await this.tryRefreshToken();
      if (!refreshed) {
        clearAuth();
        throw err;
      }

      try {
        return await exec();
      } catch (retryErr) {
        // Refresh succeeded but the retried request still failed auth — the
        // session is genuinely dead.
        if (
          retryErr instanceof APIError &&
          retryErr.statusCode === 401 &&
          retryErr.code !== "AUTH_REDIRECT"
        ) {
          clearAuth();
        }
        throw retryErr;
      }
    }
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.withAuthRetry(async () => {
      const url = new URL(path, this.baseUrl);

      if (params) {
        for (const [key, value] of Object.entries(params)) {
          url.searchParams.set(key, value);
        }
      }

      const response = await this.fetchWithSafeRedirects(url.toString(), {
        method: "GET",
        headers: this.getHeaders(),
      });

      return this.handleResponse<T>(response);
    });
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.withAuthRetry(async () => {
      const url = new URL(path, this.baseUrl);

      const response = await this.fetchWithSafeRedirects(url.toString(), {
        method: "POST",
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      return this.handleResponse<T>(response);
    });
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.withAuthRetry(async () => {
      const url = new URL(path, this.baseUrl);

      const response = await this.fetchWithSafeRedirects(url.toString(), {
        method: "PUT",
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      return this.handleResponse<T>(response);
    });
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.withAuthRetry(async () => {
      const url = new URL(path, this.baseUrl);

      const response = await this.fetchWithSafeRedirects(url.toString(), {
        method: "PATCH",
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      return this.handleResponse<T>(response);
    });
  }

  /**
   * Make a DELETE request
   */
  async delete(path: string): Promise<void> {
    return this.withAuthRetry(async () => {
      const url = new URL(path, this.baseUrl);

      const response = await this.fetchWithSafeRedirects(url.toString(), {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        await this.handleError(response);
      }
    });
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
      if (this.isAuthRedirect(response, body)) {
        // We intentionally do NOT call clearAuth() here. The server decided
        // to send us to the browser sign-in flow, but that doesn't mean the
        // stored token is garbage — it may be a CDN/edge quirk, a same-site
        // redirect, or a transient auth-middleware misroute. Wiping creds on
        // the first surprise response locks the user out of their own
        // session. Surface the error; let them re-run `envpilot login` if
        // the token really is bad.
        throw new APIError(
          "Your CLI session is not authorized for this endpoint. Please run `envpilot login` and try again.",
          401,
          "AUTH_REDIRECT"
        );
      }
      const preview = body.replace(/\s+/g, " ").slice(0, 160);
      throw new APIError(
        `Expected JSON but got ${contentType || "unknown content type"} from ${response.url}. Response starts with: ${preview}`,
        response.status || 500
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
        response.status || 500
      );
    }
  }

  /**
   * Handle API errors
   */
  private async handleError(response: Response): Promise<never> {
    // Read the body ONCE as text so we can both parse JSON errors and run the
    // HTML sign-in-page detection below without consuming the stream twice.
    const bodyText = await response.text();

    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;

    try {
      const data = JSON.parse(bodyText) as Record<string, string>;
      message = data.error || data.message || message;
      code = data.code;
    } catch {
      // Ignore JSON parsing errors — non-JSON error bodies fall through.
    }

    // Handle authentication errors.
    if (response.status === 401) {
      // Same detection as the ok-path (handleResponse): if the "401" body is
      // actually an HTML sign-in page, the auth middleware redirected us — the
      // stored token may be perfectly valid. Surface AUTH_REDIRECT WITHOUT
      // clearing creds so a CDN/edge misroute can't log the user out.
      if (this.isAuthRedirect(response, bodyText)) {
        throw new APIError(
          "Your CLI session is not authorized for this endpoint. Please run `envpilot login` and try again.",
          401,
          "AUTH_REDIRECT"
        );
      }

      // Genuine 401 — the token was rejected. Do NOT clearAuth() here; the
      // withAuthRetry wrapper first tries a one-shot token refresh and only
      // clears credentials if that fails.
      throw new APIError(
        message || "Authentication failed. Please run `envpilot login`.",
        401,
        code || "UNAUTHORIZED"
      );
    }

    // Handle tier limit errors (403 with TIER_LIMIT_REACHED code)
    if (response.status === 403 && code === "TIER_LIMIT_REACHED") {
      throw new APIError(
        message ||
          "Tier limit reached. Run `envpilot usage` to see your plan limits.",
        403,
        "TIER_LIMIT_REACHED"
      );
    }

    // Handle authorization errors
    if (response.status === 403) {
      throw new APIError(message || "Access denied.", 403, code || "FORBIDDEN");
    }

    // Handle tier limit errors
    if (response.status === 402) {
      throw new APIError(
        message ||
          "Tier limit reached. Run `envpilot usage` to see your plan limits.",
        402,
        "PAYMENT_REQUIRED"
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
    return this.get<User>("/api/cli/auth", { action: "me" });
  }

  /**
   * Get tier info for the active organization
   */
  async getTierInfo(organizationId: string): Promise<TierInfo> {
    return this.get<TierInfo>("/api/cli/tier", { organizationId });
  }

  /**
   * Get usage info for the active organization
   */
  async getUsage(organizationId: string): Promise<UsageInfo> {
    return this.get<UsageInfo>("/api/cli/usage", { organizationId });
  }

  /**
   * List organizations the user has access to
   */
  async listOrganizations(): Promise<Organization[]> {
    const response = await this.get<ApiResponse<Organization[]>>(
      "/api/cli/organizations"
    );
    return response.data || [];
  }

  /**
   * List projects in an organization
   */
  async listProjects(organizationId: string): Promise<Project[]> {
    const response = await this.get<ApiResponse<Project[]>>(
      "/api/cli/projects",
      { organizationId }
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
   * List variables in a project (with decrypted values).
   *
   * Returns both the variable list and any keys that failed vault decryption.
   * Decryption failures are skipped server-side — they will NOT appear in
   * `variables`. Callers should warn the user about `decryptionFailures`
   * so they know those secrets weren't injected.
   */
  async listVariables(
    projectId: string,
    environment?: string,
    organizationId?: string
  ): Promise<{ variables: Variable[]; decryptionFailures: string[] }> {
    const params: Record<string, string> = { projectId };
    if (environment) {
      params.environment = environment;
    }
    if (organizationId) {
      params.organizationId = organizationId;
    }
    const response = await this.get<
      ApiResponse<Variable[]> & {
        meta?: { decryptionFailures?: string[] };
      }
    >("/api/cli/variables", params);
    return {
      variables: response.data || [],
      decryptionFailures: response.meta?.decryptionFailures ?? [],
    };
  }

  /**
   * Check the variable fingerprint for a project/environment.
   *
   * Returns a short hash of variable metadata (id + version + updatedAt)
   * WITHOUT decrypting vault secrets. The CLI uses this to decide whether
   * a cached variable set is still current before doing a full (expensive)
   * fetch. If the fingerprint matches, the cache can be extended for free.
   */
  async checkFingerprint(
    projectId: string,
    environment?: string,
    organizationId?: string
  ): Promise<string> {
    const params: Record<string, string> = { projectId };
    if (environment) params.environment = environment;
    if (organizationId) params.organizationId = organizationId;
    const response = await this.get<{ fingerprint: string }>(
      "/api/cli/variables/fingerprint",
      params
    );
    return response.fingerprint;
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
    organizationId?: string;
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
    }
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
    organizationId?: string;
  }): Promise<{ created: number; updated: number; deleted: number }> {
    return this.post("/api/cli/variables/bulk", data);
  }

  /**
   * Submit a variable request (developers only — owners/PMs/team leads
   * create variables directly and get a 403 from the server here).
   */
  async createVariableRequest(
    data: CreateVariableRequestBody
  ): Promise<VariableRequest> {
    const response = await this.post<ApiResponse<{ request: VariableRequest }>>(
      "/api/cli/variable-requests",
      data
    );
    if (!response.data) {
      throw new APIError("No variable request returned by server", 500);
    }
    return response.data.request;
  }

  /**
   * List variable requests for a project, optionally filtered by status.
   */
  async listVariableRequests(
    projectId: string,
    status?: VariableRequestStatus
  ): Promise<VariableRequest[]> {
    const params: Record<string, string> = { projectId };
    if (status) params.status = status;
    const response = await this.get<
      ApiResponse<{ requests: VariableRequest[] }>
    >("/api/cli/variable-requests", params);
    return response.data?.requests ?? [];
  }

  // ============================================
  // Authentication methods
  // ============================================

  /**
   * Initiate CLI authentication flow
   */
  async initiateAuth(
    deviceName: string
  ): Promise<{ code: string; url: string; expiresAt: number }> {
    return this.post("/api/cli/auth?action=initiate", { deviceName });
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
    return this.get("/api/cli/auth", { action: "poll", code });
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    return this.post("/api/cli/auth?action=refresh", { refreshToken });
  }

  /**
   * Revoke access token (logout)
   */
  async revokeToken(): Promise<void> {
    return this.post("/api/cli/auth?action=revoke", {});
  }
}

/**
 * Create a new API client with default config
 */
export function createAPIClient(): APIClient {
  return new APIClient();
}
