// Convex-first API client.
//
// Stage 2 cutover: the CLI now authenticates with real WorkOS AuthKit JWTs and
// talks DIRECTLY to Convex for all non-vault data (organizations, projects,
// variable metadata, variable requests, tier/usage). The ONLY calls that still
// go over HTTP to the Next.js app are the WorkOS-Vault crypto paths — reading
// decrypted secret VALUES and writing (encrypting) them — because those need
// the server-side WORKOS_API_KEY. Those requests now carry a
// `Authorization: Bearer <WorkOS JWT>` header instead of the old cliTokens
// bearer.
//
// Auth freshness: WorkOS access tokens live 5 minutes. Every Convex call and
// every vault request first runs ensureFreshAccessToken(), which decodes the
// stored token's `exp` and refreshes (rotating the refresh token) when it is
// expired or within 60s of expiring, persisting the result to the active
// account.

import { ConvexHttpClient } from "convex/browser";
import {
  makeFunctionReference,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from "convex/server";
import { CONVEX_URL } from "./env.js";
import {
  getApiUrl,
  getActiveAccount,
  updateActiveAccount,
  clearAuth,
} from "./config.js";
import { isTokenExpiring } from "./jwt.js";
import { refreshAccessToken, WorkosAuthError } from "./workos.js";
import { computeFingerprint } from "./variables-cache.js";
import { normalizeOrgRole } from "./roles.js";
import type {
  ApiResponse,
  Organization,
  Project,
  Variable,
  VariablesMeta,
  User,
  UsageInfo,
  VariableRequest,
  VariableRequestStatus,
} from "../types/index.js";
import type { CreateVariableRequestBody } from "./variable-requests.js";

// ============================================================================
// Errors
// ============================================================================

/**
 * Custom error class for API errors. `statusCode` is preserved so callers can
 * branch on it (e.g. `request.ts` treats a 403 from createVariableRequest as
 * "not allowed to create — submit a request instead").
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

// ============================================================================
// Auth: fresh WorkOS access token
// ============================================================================

// Re-entrancy guard so concurrent calls share a single in-flight refresh
// instead of each hitting WorkOS (and racing to persist rotated tokens).
let refreshInFlight: Promise<string> | null = null;

/**
 * Return a valid WorkOS access token for the active account, refreshing it
 * first when it is expired or about to expire (<60s left). Persists the new
 * access token AND any rotated refresh token onto the active account.
 *
 * Throws APIError(401) when there is no session, or when the refresh token is
 * rejected (in which case local credentials are cleared so the user re-logs in).
 */
export async function ensureFreshAccessToken(): Promise<string> {
  const account = getActiveAccount();
  if (!account?.accessToken) {
    throw new APIError(
      "You are not logged in. Run `envpilot login`.",
      401,
      "NOT_AUTHENTICATED"
    );
  }

  if (!isTokenExpiring(account.accessToken)) {
    return account.accessToken;
  }

  if (refreshInFlight) return refreshInFlight;

  const refreshToken = account.refreshToken;
  if (!refreshToken) {
    throw new APIError(
      "Your session has expired. Run `envpilot login`.",
      401,
      "SESSION_EXPIRED"
    );
  }

  refreshInFlight = (async () => {
    try {
      const result = await refreshAccessToken(refreshToken);
      updateActiveAccount({
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
      });
      return result.access_token;
    } catch (err) {
      if (err instanceof WorkosAuthError && err.code === "access_denied") {
        // Refresh token revoked/expired — the session is genuinely dead.
        clearAuth();
        throw new APIError(
          "Your session has expired. Run `envpilot login`.",
          401,
          "SESSION_EXPIRED"
        );
      }
      throw err;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ============================================================================
// Convex client + function references
// ============================================================================

/**
 * Build a ConvexHttpClient authed with a freshly-minted WorkOS JWT.
 *
 * NOTE: ConvexHttpClient.setAuth takes a token STRING (unlike the reactive
 * client's fetcher), so we resolve the fresh token up front and set it. Every
 * call therefore carries a non-expired JWT.
 */
export async function getConvexClient(): Promise<ConvexHttpClient> {
  if (!CONVEX_URL) {
    throw new APIError(
      "This CLI build has no Convex URL embedded. Rebuild with NEXT_PUBLIC_CONVEX_URL set.",
      0,
      "NOT_CONFIGURED"
    );
  }
  const token = await ensureFreshAccessToken();
  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  return client;
}

// String-based function references decouple the shipped CLI from
// convex/_generated (which references the whole backend and may not be
// generated at CLI build time). Args/returns are typed here against the
// confirmed contract.

type OrgRow = {
  _id: string;
  name: string;
  slug: string;
  role?: string;
  description?: string;
  logoUrl?: string;
};
type ProjectRow = {
  _id: string;
  name: string;
  slug: string;
  organizationId: string;
  description?: string;
  icon?: string;
  color?: string;
};
type MembershipRow = { role: string } | null;
type ProjectMembershipRow = { environments?: string[] } | null;
type VariableAccessRow = {
  _id: string;
  key: string;
  environments: string[];
  version?: number;
  updatedAt?: number;
  hasAccess: boolean;
};
type ResolvedFeatures = {
  tierName: string;
  features: Record<
    string,
    { value: boolean | number | null; valueType: string }
  >;
} | null;
type OrganizationUsage = {
  tier: "free" | "pro";
  usage: UsageInfo["usage"];
} | null;

const fnRef = makeFunctionReference;

const refs = {
  listOrganizations: fnRef<
    "query",
    Record<string, never>,
    OrgRow[]
  >("organizations:listForUser"),
  getMembership: fnRef<
    "query",
    { organizationId: string },
    MembershipRow
  >("organizations:getMembership"),
  listProjectsWithStats: fnRef<
    "query",
    { organizationId: string },
    ProjectRow[]
  >("projects:listWithStats"),
  getProject: fnRef<
    "query",
    { projectId: string },
    ProjectRow | null
  >("projects:getById"),
  getProjectMembership: fnRef<
    "query",
    { projectId: string },
    ProjectMembershipRow
  >("projectMembers:getProjectMembership"),
  listVariablesWithAccess: fnRef<
    "query",
    { projectId: string; limit?: number },
    VariableAccessRow[]
  >("variables:listWithAccess"),
  listVariableRequests: fnRef<
    "query",
    { projectId: string; status?: VariableRequestStatus },
    VariableRequest[]
  >("variableRequests:listForProject"),
  getResolvedFeatures: fnRef<
    "query",
    { organizationId: string },
    ResolvedFeatures
  >("featureRegistry:getResolvedFeatures"),
  getResolvedFeaturesBatch: fnRef<
    "query",
    { organizationIds: string[] },
    ResolvedFeatures[]
  >("featureRegistry:getResolvedFeaturesBatch"),
  getOrganizationUsage: fnRef<
    "query",
    { organizationId: string },
    OrganizationUsage
  >("tierLimits:getOrganizationUsage"),
  isEnforcementEnabled: fnRef<
    "query",
    Record<string, never>,
    boolean
  >("tierLimits:isEnforcementEnabled"),
  deviceSessionRecord: fnRef<
    "mutation",
    { deviceName: string; clientType: "cli" | "extension"; sessionId: string },
    unknown
  >("deviceSessions:record"),
  deviceSessionRevoke: fnRef<
    "mutation",
    { sessionId: string },
    unknown
  >("deviceSessions:revoke"),
};

async function convexQuery<Ref extends FunctionReference<"query">>(
  ref: Ref,
  ...args: OptionalRestArgs<Ref>
): Promise<FunctionReturnType<Ref>> {
  const client = await getConvexClient();
  return client.query(ref, ...args);
}

async function convexMutation<Ref extends FunctionReference<"mutation">>(
  ref: Ref,
  ...args: OptionalRestArgs<Ref>
): Promise<FunctionReturnType<Ref>> {
  const client = await getConvexClient();
  return client.mutation(ref, ...args);
}

// ============================================================================
// Device-session record / revoke (display + remote sign-out only)
// ============================================================================

/**
 * Record this CLI device as an active session so it shows up in the web
 * active-sessions UI and can be remotely revoked. Best-effort: a failure here
 * must never block a successful login.
 */
export async function recordDeviceSession(
  deviceName: string,
  sessionId: string
): Promise<void> {
  try {
    await convexMutation(refs.deviceSessionRecord, {
      deviceName,
      clientType: "cli",
      sessionId,
    });
  } catch {
    // Non-fatal — the session record is a convenience, not load-bearing.
  }
}

/**
 * Best-effort remote revoke of a device session by its WorkOS session id.
 * Used on logout so the session disappears from the active-sessions UI and the
 * WorkOS session is invalidated server-side.
 */
export async function revokeDeviceSession(sessionId: string): Promise<void> {
  try {
    await convexMutation(refs.deviceSessionRevoke, { sessionId });
  } catch {
    // Non-fatal — local credentials are cleared regardless.
  }
}

// ============================================================================
// Feature helpers
// ============================================================================

function numericFeature(
  resolved: ResolvedFeatures,
  key: string,
  fallback: number | null = null
): number | null {
  const value = resolved?.features?.[key]?.value;
  return typeof value === "number" ? value : fallback;
}

function booleanFeature(
  resolved: ResolvedFeatures,
  key: string,
  fallback = false
): boolean {
  const value = resolved?.features?.[key]?.value;
  return typeof value === "boolean" ? value : fallback;
}

// ============================================================================
// API client
// ============================================================================

/**
 * Return the registrable domain (eTLD+1 approximation) for a hostname, used to
 * decide whether a redirect is "same site" and safe to re-issue with the
 * Authorization header.
 */
function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

const MAX_MANUAL_REDIRECTS = 5;

export class APIClient {
  private baseUrl: string;

  constructor(options?: { baseUrl?: string }) {
    this.baseUrl = options?.baseUrl ?? getApiUrl();
  }

  // ── Vault HTTP path (decrypted secret values) ──────────────────────────

  /**
   * Follow 3xx redirects manually, re-attaching Authorization only within the
   * same registrable domain (defends against the apex→www redirect that would
   * otherwise drop the header and yield a bogus 401).
   */
  private async fetchWithSafeRedirects(
    initialUrl: string,
    init: RequestInit
  ): Promise<Response> {
    let currentUrl = initialUrl;
    let currentInit: RequestInit = { ...init, redirect: "manual" };

    for (let hop = 0; hop < MAX_MANUAL_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, currentInit);

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
      if (!sameSite) headers.delete("Authorization");

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

  /** Perform an authed vault request carrying a fresh WorkOS JWT bearer. */
  private async vaultRequest<T>(
    method: string,
    path: string,
    options?: { params?: Record<string, string>; body?: unknown }
  ): Promise<T> {
    const token = await ensureFreshAccessToken();
    const url = new URL(path, this.baseUrl);
    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await this.fetchWithSafeRedirects(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    return this.handleResponse<T>(response);
  }

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

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      await this.handleError(response);
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    if (!contentType.includes("application/json")) {
      if (this.isAuthRedirect(response, body)) {
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

    try {
      return JSON.parse(body) as T;
    } catch {
      const preview = body.replace(/\s+/g, " ").slice(0, 160);
      throw new APIError(
        `Failed to parse JSON response from ${response.url}. Response starts with: ${preview}`,
        response.status || 500
      );
    }
  }

  private async handleError(response: Response): Promise<never> {
    const bodyText = await response.text();

    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const data = JSON.parse(bodyText) as Record<string, string>;
      message = data.error || data.message || message;
      code = data.code;
    } catch {
      // Non-JSON error body — fall through with the default message.
    }

    if (response.status === 401) {
      if (this.isAuthRedirect(response, bodyText)) {
        throw new APIError(
          "Your CLI session is not authorized for this endpoint. Please run `envpilot login` and try again.",
          401,
          "AUTH_REDIRECT"
        );
      }
      throw new APIError(
        message || "Authentication failed. Please run `envpilot login`.",
        401,
        code || "UNAUTHORIZED"
      );
    }

    if (response.status === 403 && code === "TIER_LIMIT_REACHED") {
      throw new APIError(
        message ||
          "Tier limit reached. Run `envpilot usage` to see your plan limits.",
        403,
        "TIER_LIMIT_REACHED"
      );
    }

    if (response.status === 403) {
      throw new APIError(message || "Access denied.", 403, code || "FORBIDDEN");
    }

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
  // High-level methods — DIRECT to Convex
  // ============================================

  /**
   * Current authenticated user. Verifies the session is live server-side (an
   * authed Convex query) and returns the identity captured at login.
   */
  async getCurrentUser(): Promise<User> {
    const account = getActiveAccount();
    if (!account) {
      throw new APIError(
        "You are not logged in. Run `envpilot login`.",
        401,
        "NOT_AUTHENTICATED"
      );
    }
    // Round-trips to Convex with a fresh JWT; throws if the session is dead.
    await convexQuery(refs.listOrganizations, {});
    return account.user;
  }

  /** List organizations the user belongs to (with tier + role). */
  async listOrganizations(): Promise<Organization[]> {
    const orgs = await convexQuery(refs.listOrganizations, {});
    const orgIds = orgs.map((o) => o._id);

    let tiers: ResolvedFeatures[] = [];
    if (orgIds.length > 0) {
      try {
        tiers = await convexQuery(refs.getResolvedFeaturesBatch, {
          organizationIds: orgIds,
        });
      } catch {
        tiers = [];
      }
    }

    return orgs.map((org, index) => ({
      _id: org._id,
      name: org.name,
      slug: org.slug,
      tier: (tiers[index]?.tierName ?? "free") as Organization["tier"],
      role: org.role,
      unifiedRole: normalizeOrgRole(org.role),
      description: org.description,
      logoUrl: org.logoUrl,
    }));
  }

  /** List projects in an organization, with unified-role + assignment info. */
  async listProjects(organizationId: string): Promise<Project[]> {
    const [projects, membership] = await Promise.all([
      convexQuery(refs.listProjectsWithStats, { organizationId }),
      convexQuery(refs.getMembership, { organizationId }),
    ]);

    const unifiedRole = normalizeOrgRole(membership?.role);
    const isOwner = unifiedRole === "owner";
    const isDeveloper = unifiedRole === "developer";
    const legacyProjectRole = isOwner
      ? null
      : isDeveloper
        ? "developer"
        : "manager";

    return Promise.all(
      projects.map(async (project) => {
        let assigned = isOwner;
        let environmentScope: string[] | null = null;
        if (!isOwner) {
          const projectMembership = await convexQuery(
            refs.getProjectMembership,
            { projectId: project._id }
          );
          assigned = projectMembership !== null;
          environmentScope = isDeveloper
            ? (projectMembership?.environments ?? null)
            : null;
        }
        return {
          _id: project._id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          icon: project.icon,
          color: project.color,
          organizationId: project.organizationId,
          userRole: unifiedRole,
          projectRole: legacyProjectRole,
          unifiedRole,
          assigned,
          environmentScope,
        };
      })
    );
  }

  /** Get a single project (metadata) by id. */
  async getProject(projectId: string): Promise<Project> {
    const project = await convexQuery(refs.getProject, { projectId });
    if (!project) {
      throw new APIError("Project not found", 404, "PROJECT_NOT_FOUND");
    }
    return {
      _id: project._id,
      name: project.name,
      slug: project.slug,
      organizationId: project.organizationId,
      description: project.description,
      icon: project.icon,
      color: project.color,
    };
  }

  /**
   * Compute the variable fingerprint from Convex METADATA (no vault decryption).
   * Byte-compatible with the fingerprint writeCache stores from a full fetch:
   * both hash `${_id}:${version}:${updatedAt}` over the accessible variables in
   * the requested environment.
   */
  async checkFingerprint(
    projectId: string,
    environment?: string,
    _organizationId?: string
  ): Promise<string> {
    const rows = await convexQuery(refs.listVariablesWithAccess, { projectId });
    const filtered = rows.filter(
      (row) =>
        row.hasAccess &&
        (!environment || row.environments.includes(environment))
    );
    const asVariables = filtered.map(
      (row) =>
        ({
          _id: row._id,
          version: row.version,
          updatedAt: row.updatedAt,
        }) as Variable
    );
    return computeFingerprint(asVariables);
  }

  /** List variable requests for a project (Convex). */
  async listVariableRequests(
    projectId: string,
    status?: VariableRequestStatus
  ): Promise<VariableRequest[]> {
    return convexQuery(refs.listVariableRequests, { projectId, status });
  }

  /** Tier + usage snapshot for an organization (Convex). */
  async getUsage(organizationId: string): Promise<UsageInfo> {
    const membership = await convexQuery(refs.getMembership, {
      organizationId,
    });
    if (!membership) {
      throw new APIError(
        "You are not a member of this organization",
        403,
        "FORBIDDEN"
      );
    }

    const [usageData, enforcementEnabled, resolved] = await Promise.all([
      convexQuery(refs.getOrganizationUsage, { organizationId }),
      convexQuery(refs.isEnforcementEnabled, {}),
      convexQuery(refs.getResolvedFeatures, { organizationId }),
    ]);

    if (!usageData) {
      throw new APIError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    }

    return {
      tier: (resolved?.tierName ?? usageData.tier) as UsageInfo["tier"],
      enforcementEnabled,
      limits: {
        projects: numericFeature(resolved, "max_projects"),
        variablesPerProject: numericFeature(
          resolved,
          "max_variables_per_project"
        ),
        teamMembers: numericFeature(resolved, "max_team_members"),
      },
      usage: usageData.usage,
      features: {
        versionHistory: booleanFeature(resolved, "variable_version_history"),
        bulkImport: booleanFeature(resolved, "bulk_import"),
        extensionAccess: booleanFeature(resolved, "extension_access", true),
        granularPermissions: booleanFeature(resolved, "granular_permissions"),
        auditLogRetentionDays:
          numericFeature(resolved, "audit_log_retention_days") ?? 7,
      },
    };
  }

  // ============================================
  // High-level methods — VAULT (over HTTP)
  // ============================================

  /**
   * List variables in a project WITH decrypted values (vault path).
   * Returns the variable list, the response meta (unified role / scope info),
   * and any keys that failed vault decryption (skipped server-side).
   */
  async listVariables(
    projectId: string,
    environment?: string,
    organizationId?: string
  ): Promise<{
    variables: Variable[];
    meta: VariablesMeta | undefined;
    decryptionFailures: string[];
  }> {
    const params: Record<string, string> = { projectId };
    if (environment) params.environment = environment;
    if (organizationId) params.organizationId = organizationId;

    const response = await this.vaultRequest<
      ApiResponse<Variable[]> & { meta?: VariablesMeta }
    >("GET", "/api/cli/variables", { params });

    return {
      variables: response.data || [],
      meta: response.meta,
      decryptionFailures: response.meta?.decryptionFailures ?? [],
    };
  }

  /** Bulk create/update variables (vault path — encrypts values server-side). */
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
  }): Promise<{
    created: number;
    updated: number;
    deleted: number;
    total: number;
    skipped?: number;
    deniedKeys?: string[];
  }> {
    const response = await this.vaultRequest<
      ApiResponse<{
        created: number;
        updated: number;
        deleted: number;
        total: number;
        skipped?: number;
        deniedKeys?: string[];
      }>
    >("POST", "/api/cli/variables/bulk", { body: data });
    if (!response.data) {
      throw new APIError("No result returned by server", 500);
    }
    return response.data;
  }

  /**
   * Submit a variable request (developers only). Goes over the vault path
   * because the requested value is encrypted into WorkOS Vault server-side;
   * owners/PMs/team leads get a 403 here and create variables directly.
   */
  async createVariableRequest(
    data: CreateVariableRequestBody
  ): Promise<VariableRequest> {
    const response = await this.vaultRequest<
      ApiResponse<{ request: VariableRequest }>
    >("POST", "/api/cli/variable-requests", { body: data });
    if (!response.data) {
      throw new APIError("No variable request returned by server", 500);
    }
    return response.data.request;
  }
}

/**
 * Create a new API client with default config.
 */
export function createAPIClient(): APIClient {
  return new APIClient();
}
