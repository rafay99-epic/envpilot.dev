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
import { getActiveAccount, updateActiveAccount, clearAuth } from "./config.js";
import { isTokenExpiring } from "./jwt.js";
import { refreshAccessToken, WorkosAuthError } from "./workos.js";
import { computeFingerprint } from "./variables-cache.js";
import { normalizeOrgRole } from "./roles.js";
import type {
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

// Direct-to-Convex value read/write (Stage 3, Phase 2) — replaces the deleted
// /api/cli/variables{,/bulk} and /api/cli/variable-requests vault routes.
type PulledVariableRow = {
  _id: string;
  key: string;
  value: string;
  description?: string;
  environments: string[];
  projectId: string;
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  access: "read" | "write";
};
type PullMeta = {
  role: "admin" | "team_lead" | "member";
  projectRole: "manager" | "developer" | "viewer" | null;
  unifiedRole: string;
  assigned: boolean;
  grantOnly: boolean;
  environmentScope: string[] | null;
  hasWriteAccess: boolean;
  scopeRestricted: boolean;
  decryptionFailures?: string[];
  /** Resolved capability map (additive; absent on older deployments). */
  capabilities?: Record<string, boolean>;
};
type PullValuesResult = { variables: PulledVariableRow[]; meta: PullMeta };

/** Result of the metadata-only fingerprint check used by `run`. */
export interface FingerprintCheck {
  fingerprint: string;
  /** Accessible variables in the project across ALL environments. */
  totalAccessible: number;
  /** Accessible variables matching the requested environment. */
  matchingCount: number;
  /** Accessible variables that exist only in other environments. */
  otherEnvKeys: Array<{ key: string; environments: string[] }>;
}
type PushBulkResult = {
  created: number;
  updated: number;
  deleted: number;
  total: number;
  skipped?: number;
  deniedKeys?: string[];
};
type PushVariableInput = {
  key: string;
  value: string;
  description?: string;
  isSensitive?: boolean;
};

const fnRef = makeFunctionReference;

const refs = {
  listOrganizations: fnRef<"query", Record<string, never>, OrgRow[]>(
    "features/organizations/queries:listForUser"
  ),
  getMembership: fnRef<"query", { organizationId: string }, MembershipRow>(
    "features/organizations/queries:getMembership"
  ),
  listProjectsWithStats: fnRef<
    "query",
    { organizationId: string },
    ProjectRow[]
  >("features/projects/queries:listWithStats"),
  getProject: fnRef<"query", { projectId: string }, ProjectRow | null>(
    "features/projects/queries:getById"
  ),
  getProjectMembership: fnRef<
    "query",
    { projectId: string },
    ProjectMembershipRow
  >("features/projects/members:getProjectMembership"),
  listVariablesWithAccess: fnRef<
    "query",
    { projectId: string; limit?: number },
    VariableAccessRow[]
  >("features/variables/queries:listWithAccess"),
  listVariableRequests: fnRef<
    "query",
    { projectId: string; status?: VariableRequestStatus },
    VariableRequest[]
  >("features/variables/requests/queries:listForProject"),
  getResolvedFeatures: fnRef<
    "query",
    { organizationId: string },
    ResolvedFeatures
  >("features/featureRegistry/queries:getResolvedFeatures"),
  getResolvedFeaturesBatch: fnRef<
    "query",
    { organizationIds: string[] },
    ResolvedFeatures[]
  >("features/featureRegistry/queries:getResolvedFeaturesBatch"),
  getOrganizationUsage: fnRef<
    "query",
    { organizationId: string },
    OrganizationUsage
  >("features/billing/tierLimits:getOrganizationUsage"),
  isEnforcementEnabled: fnRef<"query", Record<string, never>, boolean>(
    "features/billing/tierLimits:isEnforcementEnabled"
  ),
  deviceSessionRecord: fnRef<
    "mutation",
    { deviceName: string; clientType: "cli" | "extension"; sessionId: string },
    unknown
  >("features/users/deviceSessions:record"),
  deviceSessionRevoke: fnRef<"mutation", { sessionId: string }, unknown>(
    "features/users/deviceSessions:revoke"
  ),
  pullValues: fnRef<
    "action",
    { projectId: string; environment?: string; metadataOnly?: boolean },
    PullValuesResult
  >("features/variables/values:pullValues"),
  pushBulk: fnRef<
    "action",
    {
      projectId: string;
      environment: string;
      variables: PushVariableInput[];
      mode?: "merge" | "replace";
    },
    PushBulkResult
  >("features/variables/values:pushBulk"),
  createVariableRequest: fnRef<
    "action",
    {
      projectId: string;
      key: string;
      value: string;
      environments: string[];
      isSensitive?: boolean;
      description?: string;
    },
    VariableRequest
  >("features/variables/requests/actions:createWithValue"),
  reviewRequest: fnRef<
    "mutation",
    {
      requestId: string;
      action: "approve" | "reject";
      reviewReason?: string;
    },
    unknown
  >("features/variables/requests/mutations:review"),
  approveRequestWithValue: fnRef<
    "action",
    { requestId: string; value: string; reviewReason?: string },
    unknown
  >("features/variables/requests/actions:approveWithValue"),
  cancelRequest: fnRef<"mutation", { requestId: string }, unknown>(
    "features/variables/requests/mutations:cancel"
  ),
  removeVariable: fnRef<"mutation", { variableId: string }, unknown>(
    "features/variables/mutations:remove"
  ),
  updateVariable: fnRef<
    "mutation",
    { variableId: string; environments?: string[]; changeReason?: string },
    unknown
  >("features/variables/mutations:update"),
  resolveProjectRoles: fnRef<
    "query",
    { projectId: string },
    {
      role: string;
      assigned: boolean;
      grantOnly: boolean;
      environmentScope: string[] | null;
      capabilities: Record<string, boolean>;
    }
  >("features/auth/queries:resolveLegacyRoles"),
  getVariableRequest: fnRef<
    "query",
    { requestId: string },
    { vaultRef?: string; status: string; key: string } | null
  >("features/variables/requests/queries:getById"),
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

async function convexAction<Ref extends FunctionReference<"action">>(
  ref: Ref,
  ...args: OptionalRestArgs<Ref>
): Promise<FunctionReturnType<Ref>> {
  const client = await getConvexClient();
  return client.action(ref, ...args);
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

export class APIClient {
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
   *
   * Also reports how the environment filter carved up the accessible set, so
   * `run` can say "injected 8 of 12 — 4 exist only in staging" instead of
   * silently dropping variables that live in other environments.
   */
  async checkFingerprint(
    projectId: string,
    environment?: string,
    _organizationId?: string
  ): Promise<FingerprintCheck> {
    const rows = await convexQuery(refs.listVariablesWithAccess, { projectId });
    const accessible = rows.filter((row) => row.hasAccess);
    const matching = accessible.filter(
      (row) => !environment || row.environments.includes(environment)
    );
    const otherEnvKeys = accessible
      .filter((row) => environment && !row.environments.includes(environment))
      .map((row) => ({ key: row.key, environments: row.environments }));

    const asVariables = matching.map(
      (row) =>
        ({
          _id: row._id,
          version: row.version,
          updatedAt: row.updatedAt,
        }) as Variable
    );
    return {
      fingerprint: computeFingerprint(asVariables),
      totalAccessible: accessible.length,
      matchingCount: matching.length,
      otherEnvKeys,
    };
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
      throw new APIError(
        "Organization not found",
        404,
        "ORGANIZATION_NOT_FOUND"
      );
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
    _organizationId?: string
  ): Promise<{
    variables: Variable[];
    meta: VariablesMeta | undefined;
    decryptionFailures: string[];
  }> {
    // Direct Convex action (encrypts/decrypts server-side) — replaces the
    // deleted GET /api/cli/variables vault route.
    const result = await convexAction(refs.pullValues, {
      projectId,
      ...(environment ? { environment } : {}),
    });

    const variables: Variable[] = result.variables
      // Variables whose value failed to decrypt are surfaced via
      // meta.decryptionFailures and NOT injected — matching the old
      // GET /api/cli/variables route, which omitted them from `data`
      // entirely (never wrote a "[DECRYPTION_FAILED]" placeholder to .env).
      .filter((row) => row.value !== "[DECRYPTION_FAILED]")
      .map((row) => ({
        _id: row._id,
        key: row.key,
        value: row.value,
        // The CLI Variable type expects a single environment string. Echo the
        // requested one, else the first the variable belongs to.
        environment: (environment ??
          row.environments[0] ??
          "development") as Variable["environment"],
        projectId: row.projectId,
        description: row.description,
        isSensitive: row.isSensitive,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        access: row.access,
      }));

    // Preserve the legacy meta block old CLI builds derive .env protection
    // from (role / projectRole are passthrough keys of CliVariablesMeta).
    const meta = {
      total: variables.length,
      environment: environment ?? "all",
      role: result.meta.role,
      projectRole: result.meta.projectRole,
      unifiedRole: result.meta.unifiedRole,
      assigned: result.meta.assigned,
      grantOnly: result.meta.grantOnly,
      environmentScope: result.meta.environmentScope,
      hasWriteAccess: result.meta.hasWriteAccess,
      scopeRestricted: result.meta.scopeRestricted,
      decryptionFailures: result.meta.decryptionFailures,
      capabilities: result.meta.capabilities,
    } as unknown as VariablesMeta;

    return {
      variables,
      meta,
      decryptionFailures: result.meta.decryptionFailures ?? [],
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
    // Direct Convex action (encrypts server-side, diffs against existing) —
    // replaces the deleted POST /api/cli/variables/bulk vault route.
    return convexAction(refs.pushBulk, {
      projectId: data.projectId,
      environment: data.environment,
      variables: data.variables,
      mode: data.mode,
    });
  }

  /**
   * Submit a variable request (developers only). Goes over the vault path
   * because the requested value is encrypted into WorkOS Vault server-side;
   * owners/PMs/team leads get a 403 here and create variables directly.
   */
  async createVariableRequest(
    data: CreateVariableRequestBody
  ): Promise<VariableRequest> {
    // Direct Convex action (encrypts the proposed value server-side) —
    // replaces the deleted POST /api/cli/variable-requests vault route.
    const created = await convexAction(refs.createVariableRequest, {
      projectId: data.projectId,
      key: data.key,
      value: data.value,
      environments: data.environments,
      isSensitive: data.isSensitive,
      description: data.description,
    });
    if (!created) {
      throw new APIError("No variable request returned by server", 500);
    }
    return created;
  }

  /** Approve or reject a request that already carries a value (developer flow). */
  async reviewRequest(
    requestId: string,
    action: "approve" | "reject",
    reviewReason?: string
  ): Promise<void> {
    await convexMutation(refs.reviewRequest, {
      requestId,
      action,
      reviewReason,
    });
  }

  /**
   * Approve a VALUELESS (machine) request by supplying the secret value —
   * the server encrypts it into the vault at approval time.
   */
  async approveRequestWithValue(
    requestId: string,
    value: string,
    reviewReason?: string
  ): Promise<void> {
    await convexAction(refs.approveRequestWithValue, {
      requestId,
      value,
      reviewReason,
    });
  }

  /** Cancel a pending request (requester or a reviewer). */
  async cancelRequest(requestId: string): Promise<void> {
    await convexMutation(refs.cancelRequest, { requestId });
  }

  /**
   * Role + capability snapshot for the caller in one project. Used by the
   * CLI ONLY to route flows (direct write vs request) and phrase denials —
   * the Convex mutations remain the enforcement boundary.
   */
  async resolveProjectRoles(projectId: string): Promise<{
    role: string;
    assigned: boolean;
    grantOnly: boolean;
    environmentScope: string[] | null;
    capabilities: Record<string, boolean>;
  }> {
    return convexQuery(refs.resolveProjectRoles, { projectId });
  }

  /**
   * One request by id — enough to know whether it is pending and whether it
   * carries a value (machine requests don't; approval must supply one).
   */
  async getVariableRequest(
    requestId: string
  ): Promise<{ vaultRef?: string; status: string; key: string } | null> {
    return convexQuery(refs.getVariableRequest, { requestId });
  }

  /** Soft-delete a single variable by id (moves it to trash). */
  async removeVariable(variableId: string): Promise<void> {
    await convexMutation(refs.removeVariable, { variableId });
  }

  /**
   * Set a single variable's value in one environment — upsert via the bulk
   * vault path with merge semantics (creates if absent, updates if present;
   * leaves every other variable untouched).
   *
   * Throws when the server accepted the call but wrote nothing (the single
   * entry was skipped/denied by variable-level authorization) — a silent
   * "success" here would lie to the user.
   */
  async setVariable(
    projectId: string,
    environment: string,
    key: string,
    value: string,
    opts?: { description?: string; isSensitive?: boolean }
  ): Promise<{ created: number; updated: number }> {
    const result = await convexAction(refs.pushBulk, {
      projectId,
      environment,
      variables: [
        {
          key,
          value,
          description: opts?.description,
          isSensitive: opts?.isSensitive,
        },
      ],
      mode: "merge",
    });
    if (result.created === 0 && result.updated === 0) {
      const denied = result.deniedKeys?.includes(key);
      throw new APIError(
        denied
          ? `You do not have write access to ${key}.`
          : `${key} was not written (skipped by the server).`,
        403,
        "PERMISSION_DENIED"
      );
    }
    return { created: result.created, updated: result.updated };
  }

  /**
   * Metadata for the active variable holding `key` in `environment` (id +
   * the FULL environments list, so single-env commands can detect that the
   * variable is shared across environments). Returns null if absent.
   */
  async findVariable(
    projectId: string,
    environment: string,
    key: string
  ): Promise<{ _id: string; environments: string[] } | null> {
    // High limit: the default 500-row window would silently miss keys in
    // large projects and report them as "not found".
    const rows = await convexQuery(refs.listVariablesWithAccess, {
      projectId,
      limit: 5000,
    });
    const match = rows.find(
      (row) =>
        row.key === key &&
        row.hasAccess &&
        row.environments.includes(environment)
    );
    return match ? { _id: match._id, environments: match.environments } : null;
  }

  /**
   * Metadata-only variable listing for an environment (no vault reads, no
   * value-access audit entries). Used by `diff` without --values.
   */
  async listVariableKeys(
    projectId: string,
    environment: string
  ): Promise<{ keys: string[]; truncated: boolean }> {
    const limit = 5000;
    const rows = await convexQuery(refs.listVariablesWithAccess, {
      projectId,
      limit,
    });
    return {
      keys: rows
        .filter(
          (row) => row.hasAccess && row.environments.includes(environment)
        )
        .map((row) => row.key),
      truncated: rows.length >= limit,
    };
  }

  /**
   * Re-scope a shared variable: drop `environment` from its environments
   * list, leaving its value live in the remaining environments.
   */
  async removeVariableFromEnvironment(
    variableId: string,
    environments: string[],
    environment: string
  ): Promise<void> {
    await convexMutation(refs.updateVariable, {
      variableId,
      environments: environments.filter((env) => env !== environment),
      changeReason: `Removed from ${environment} via CLI`,
    });
  }
}

/**
 * Create a new API client with default config.
 */
export function createAPIClient(): APIClient {
  return new APIClient();
}
