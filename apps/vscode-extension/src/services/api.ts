import * as vscode from "vscode";
import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getServerUrl, getConvexUrl } from "../utils/config";
import { SingleFlight } from "../utils/singleFlight";
import { TokenManager } from "./tokenManager";
import { captureError } from "../utils/sentry";
import { normalizeOrgRole } from "../roles";
import type {
  Organization,
  Project,
  EnvironmentVariable,
  DeviceInfo,
  VariableRequest,
  UsageInfo,
} from "../types";

// ============================================================================
// Convex row shapes (typed against the confirmed Stage-2 contract; anyApi is
// untyped so results are cast to these).
// ============================================================================

interface OrgRow {
  _id: string;
  name: string;
  slug: string;
  role?: string;
  description?: string;
  logoUrl?: string;
}
interface ProjectRow {
  _id: string;
  name: string;
  slug: string;
  organizationId: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  userRole?: string | null;
  projectRole?: string | null;
}
interface MembershipRow {
  role: string;
}
interface ProjectMembershipRow {
  environments?: string[];
}
type ResolvedFeatures = {
  tierName: string;
  features: Record<
    string,
    { value: boolean | number | null; valueType: string }
  >;
} | null;
interface OrganizationUsage {
  tier: "free" | "pro";
  usage: UsageInfo["usage"];
}
interface CheckFeatureResult {
  allowed: boolean;
  value: boolean | number | null;
  tierName: string;
  reason?: string;
}

// Shape returned by the variableValues.pullValues Convex action (Stage 3,
// Phase 2) — the direct replacement for GET /api/extension/variables.
interface PullValuesResult {
  variables: Array<{
    _id: string;
    key: string;
    value: string;
    description?: string;
    environments: string[];
    projectId: string;
    isSensitive: boolean;
    version: number;
    access: "read" | "write";
  }>;
  meta: {
    role: string;
    unifiedRole: string;
    assigned: boolean;
    grantOnly: boolean;
    environmentScope: string[] | null;
    hasWriteAccess: boolean;
    scopeRestricted: boolean;
    decryptionFailures?: string[];
  };
}

const LINK_EXPIRES_DAYS_DEFAULT = 30;

/**
 * API service for communicating with the Envpilot backend.
 *
 * Stage-2 cutover: identity is a WorkOS AuthKit JWT. All non-vault data
 * (organizations, projects, variable metadata/requests, tier/usage) is read
 * DIRECTLY from Convex over an authenticated HTTP client. The only calls that
 * still go over HTTP to the Next.js app are the WorkOS-Vault crypto paths —
 * reading decrypted secret VALUES and creating variable requests (encrypted
 * server-side) — carrying an `Authorization: Bearer <fresh JWT>` header.
 */
export class ApiService {
  private client: AxiosInstance;
  private tokenManager: TokenManager;
  private roleCache: Map<string, string> = new Map();
  private projectRoleCache: Map<string, string> = new Map();
  /**
   * Authoritative unified access facts returned alongside each getVariables
   * response (additive server fields). Populated on the SAME request that
   * fetches the variables, so it never goes stale relative to a sync. File
   * protection reads this first; the role caches are the fallback.
   */
  private accessMetaCache: Map<
    string,
    {
      unifiedRole?: string;
      assigned?: boolean;
      environmentScope?: string[] | null;
      hasWriteAccess?: boolean;
      scopeRestricted?: boolean;
    }
  > = new Map();
  /** Short-TTL response cache (one sync fans out to several refreshes). */
  private responseCache: Map<string, { at: number; value: unknown }> =
    new Map();
  private static readonly CACHE_TTL_MS = 30_000;
  /** In-flight GET coalescing keyed by cache key (single-flight). */
  private inflight = new SingleFlight();
  /** Guards against stacking multiple "session expired" prompts at once. */
  private reauthPromptActive = false;

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
    this.client = axios.create({
      timeout: 30000,
    });

    // Attach a fresh WorkOS JWT bearer to every vault HTTP request.
    this.client.interceptors.request.use(async (config) => {
      config.baseURL = getServerUrl();
      const token = await this.tokenManager.getFreshToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // On a 401 the token was already fresh, so a rejected request means the
    // session is dead server-side — surface a single reauth prompt.
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<{ error?: string }>) => {
        const status = error.response?.status;
        const config = error.config as
          | (InternalAxiosRequestConfig & { _envpilotRetried?: boolean })
          | undefined;

        if (status === 401 && config && !config._envpilotRetried) {
          config._envpilotRetried = true;
          void this.promptReauth();
        }

        const message = error.response?.data?.error || error.message;
        throw Object.assign(new Error(message), { status });
      }
    );
  }

  // ============================================
  // Auth-scoped Convex client
  // ============================================

  /**
   * Build a ConvexHttpClient authed with a freshly-minted WorkOS JWT. The HTTP
   * client's setAuth takes a token STRING, so the token is resolved up front —
   * every call therefore carries a non-expired JWT.
   */
  private async getConvexClient(): Promise<ConvexHttpClient> {
    const url = getConvexUrl();
    if (!url) {
      throw new Error(
        "No Convex URL available. Set envpilot.convexUrl or reinstall the extension."
      );
    }
    const token = await this.tokenManager.getFreshToken();
    if (!token) {
      throw Object.assign(new Error("You are not signed in."), { status: 401 });
    }
    const client = new ConvexHttpClient(url);
    client.setAuth(token);
    return client;
  }

  private async convexQuery<T>(
    ref: unknown,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const client = await this.getConvexClient();
    // anyApi refs are untyped — the concrete shape is enforced by our casts.
    return client.query(ref as never, args as never) as Promise<T>;
  }

  private async convexMutation<T>(
    ref: unknown,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const client = await this.getConvexClient();
    return client.mutation(ref as never, args as never) as Promise<T>;
  }

  private async convexAction<T>(
    ref: unknown,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    const client = await this.getConvexClient();
    return client.action(ref as never, args as never) as Promise<T>;
  }

  // ============================================
  // Caching / reauth helpers
  // ============================================

  private async promptReauth(): Promise<void> {
    if (this.reauthPromptActive) {
      return;
    }
    this.reauthPromptActive = true;
    try {
      const action = await vscode.window.showWarningMessage(
        "Envpilot: Session expired — sign in again to continue.",
        "Sign In"
      );
      if (action === "Sign In") {
        await vscode.commands.executeCommand("envpilot.signIn");
      }
    } finally {
      this.reauthPromptActive = false;
    }
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.responseCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > ApiService.CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private setCached(key: string, value: unknown): void {
    this.responseCache.set(key, { at: Date.now(), value });
  }

  private coalesce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    return this.inflight.run(key, fetcher);
  }

  /** Drop all cached responses (manual refresh, sign-out, account switch). */
  clearCache(): void {
    this.responseCache.clear();
    this.inflight.clear();
    this.roleCache.clear();
    this.projectRoleCache.clear();
    this.accessMetaCache.clear();
  }

  private static numericFeature(
    resolved: ResolvedFeatures,
    key: string,
    fallback: number | null = null
  ): number | null {
    const value = resolved?.features?.[key]?.value;
    return typeof value === "number" ? value : fallback;
  }

  private static booleanFeature(
    resolved: ResolvedFeatures,
    key: string,
    fallback = false
  ): boolean {
    const value = resolved?.features?.[key]?.value;
    return typeof value === "boolean" ? value : fallback;
  }

  // ============================================
  // Organizations — DIRECT Convex
  // ============================================

  async getOrganizations(): Promise<Organization[]> {
    const cached = this.getCached<Organization[]>("orgs");
    if (cached) return cached;

    return this.coalesce("orgs", async () => {
      const orgs = await this.convexQuery<OrgRow[]>(
        anyApi.organizations.listForUser,
        {}
      );

      const orgIds = orgs.map((o) => o._id);
      let tiers: ResolvedFeatures[] = [];
      if (orgIds.length > 0) {
        try {
          tiers = await this.convexQuery<ResolvedFeatures[]>(
            anyApi.featureRegistry.getResolvedFeaturesBatch,
            { organizationIds: orgIds }
          );
        } catch {
          tiers = [];
        }
      }

      const organizations: Organization[] = orgs.map((org, index) => ({
        _id: org._id,
        name: org.name,
        slug: org.slug,
        tier: (tiers[index]?.tierName === "pro"
          ? "pro"
          : "free") as Organization["tier"],
        unifiedRole: normalizeOrgRole(org.role),
      }));

      this.setCached("orgs", organizations);
      return organizations;
    });
  }

  // ============================================
  // Projects — DIRECT Convex
  // ============================================

  async getProjects(organizationId?: string): Promise<Project[]> {
    const cacheKey = `projects:${organizationId ?? "all"}`;
    const cached = this.getCached<Project[]>(cacheKey);
    if (cached) return cached;

    return this.coalesce(cacheKey, async () => {
      const projects = organizationId
        ? await this.listProjectsForOrg(organizationId)
        : await this.listAllProjects();

      for (const project of projects) {
        if (project.unifiedRole) {
          this.roleCache.set(project._id, project.unifiedRole);
        }
        if (project.projectRole) {
          this.projectRoleCache.set(project._id, project.projectRole);
        }
      }

      this.setCached(cacheKey, projects);
      return projects;
    });
  }

  /** Projects within one organization, with unified-role + assignment info. */
  private async listProjectsForOrg(organizationId: string): Promise<Project[]> {
    const [projects, membership] = await Promise.all([
      this.convexQuery<ProjectRow[]>(anyApi.projects.listWithStats, {
        organizationId,
      }),
      this.convexQuery<MembershipRow | null>(
        anyApi.organizations.getMembership,
        { organizationId }
      ),
    ]);

    const unifiedRole = normalizeOrgRole(membership?.role);
    return Promise.all(
      projects.map((project) =>
        this.mapProject(project, unifiedRole, unifiedRole === "owner")
      )
    );
  }

  /** Every accessible project across all orgs (per-project role). */
  private async listAllProjects(): Promise<Project[]> {
    const projects = await this.convexQuery<ProjectRow[]>(
      anyApi.projects.listForUser,
      {}
    );
    return Promise.all(
      projects.map((project) => {
        const unifiedRole = normalizeOrgRole(project.userRole);
        return this.mapProject(project, unifiedRole, unifiedRole === "owner");
      })
    );
  }

  /**
   * Resolve per-project assignment + environment scope. Owners are implicitly
   * assigned to every project; everyone else's assignment/scope comes from the
   * projectMembers row.
   */
  private async mapProject(
    project: ProjectRow,
    unifiedRole: ReturnType<typeof normalizeOrgRole>,
    isOwner: boolean
  ): Promise<Project> {
    const legacyProjectRole = isOwner
      ? null
      : unifiedRole === "developer"
        ? "developer"
        : "manager";

    let assigned = isOwner;
    let environmentScope: string[] | null = null;
    if (!isOwner) {
      const projectMembership =
        await this.convexQuery<ProjectMembershipRow | null>(
          anyApi.projectMembers.getProjectMembership,
          { projectId: project._id }
        );
      assigned = projectMembership !== null;
      environmentScope =
        unifiedRole === "developer"
          ? (projectMembership?.environments ?? null)
          : null;
    }

    return {
      _id: project._id,
      name: project.name,
      slug: project.slug,
      description: project.description ?? null,
      organizationId: project.organizationId,
      icon: project.icon ?? null,
      color: project.color ?? null,
      userRole: null,
      projectRole: legacyProjectRole,
      unifiedRole,
      assigned,
      environmentScope,
    };
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const project = await this.convexQuery<ProjectRow | null>(
        anyApi.projects.getById,
        { projectId }
      );
      if (!project) return null;
      return {
        _id: project._id,
        name: project.name,
        slug: project.slug,
        description: project.description ?? null,
        organizationId: project.organizationId,
        icon: project.icon ?? null,
        color: project.color ?? null,
      };
    } catch (err) {
      captureError(err, { phase: "get-project" });
      return null;
    }
  }

  // ============================================
  // Variables — VAULT over HTTP (JWT bearer)
  // ============================================

  async getVariables(
    projectId: string,
    environment: string,
    organizationId?: string,
    options?: { fresh?: boolean }
  ): Promise<EnvironmentVariable[]> {
    const cacheKey = `vars:${projectId}:${environment}:${organizationId ?? ""}`;
    if (!options?.fresh) {
      const cached = this.getCached<EnvironmentVariable[]>(cacheKey);
      if (cached) return cached;
    }

    return this.coalesce(cacheKey, async () => {
      // Direct Convex action (decrypts server-side) — replaces the deleted
      // GET /api/extension/variables vault route.
      const result = await this.convexAction<PullValuesResult>(
        anyApi.variableValues.pullValues,
        { projectId, environment }
      );

      this.roleCache.set(projectId, result.meta.role);
      this.cacheAccessMeta(projectId, result.meta);

      const variables = result.variables.map((row) =>
        ApiService.toEnvironmentVariable(row)
      );
      this.setCached(cacheKey, variables);
      return variables;
    });
  }

  /** Map a pullValues row into the extension's EnvironmentVariable shape. */
  private static toEnvironmentVariable(
    row: PullValuesResult["variables"][number]
  ): EnvironmentVariable {
    return {
      _id: row._id,
      key: row.key,
      value: row.value,
      description: row.description ?? null,
      environments: row.environments,
      projectId: row.projectId,
      isSensitive: row.isSensitive,
      version: row.version,
      access: row.access,
    };
  }

  private cacheAccessMeta(
    projectId: string,
    data:
      | {
          unifiedRole?: string;
          assigned?: boolean;
          environmentScope?: string[] | null;
          hasWriteAccess?: boolean;
          scopeRestricted?: boolean;
        }
      | undefined
  ): void {
    if (!data) return;
    if (
      data.unifiedRole !== undefined ||
      data.assigned !== undefined ||
      data.hasWriteAccess !== undefined ||
      data.environmentScope !== undefined
    ) {
      this.accessMetaCache.set(projectId, {
        unifiedRole: data.unifiedRole,
        assigned: data.assigned,
        environmentScope: data.environmentScope,
        hasWriteAccess: data.hasWriteAccess,
        scopeRestricted: data.scopeRestricted,
      });
    }
  }

  getAccessMeta(projectId: string):
    | {
        unifiedRole?: string;
        assigned?: boolean;
        environmentScope?: string[] | null;
        hasWriteAccess?: boolean;
        scopeRestricted?: boolean;
      }
    | undefined {
    return this.accessMetaCache.get(projectId);
  }

  /**
   * Variable metadata only — `value` is always empty. Used by UI surfaces
   * (tree view, dashboard) that never display values: skips per-variable vault
   * decryption on the server and avoids logging spurious "export" audit events.
   */
  async getVariablesMetadata(
    projectId: string,
    environment: string,
    organizationId?: string
  ): Promise<EnvironmentVariable[]> {
    const cacheKey = `varsmeta:${projectId}:${environment}:${organizationId ?? ""}`;
    const cached = this.getCached<EnvironmentVariable[]>(cacheKey);
    if (cached) return cached;

    return this.coalesce(cacheKey, async () => {
      // Direct Convex action, metadata-only (no vault decryption, no export
      // audit) — replaces the deleted GET /api/extension/variables?metadataOnly.
      const result = await this.convexAction<PullValuesResult>(
        anyApi.variableValues.pullValues,
        { projectId, environment, metadataOnly: true }
      );

      this.roleCache.set(projectId, result.meta.role);
      this.cacheAccessMeta(projectId, result.meta);

      const variables = result.variables.map((row) =>
        ApiService.toEnvironmentVariable(row)
      );
      this.setCached(cacheKey, variables);
      return variables;
    });
  }

  /** Cached org role for a project (raw role string; normalize before use). */
  getUserRole(projectId: string): string | undefined {
    return this.roleCache.get(projectId);
  }

  /** Cached project role (raw role string; compare after normalizing). */
  getProjectRole(projectId: string): string | undefined {
    return this.projectRoleCache.get(projectId);
  }

  // ============================================
  // Project linking — DIRECT Convex mutations
  // ============================================

  /**
   * Record this device's scoping row for a project. Identity is the JWT; the
   * mutation returns the projectAccess id + token but the extension no longer
   * stores that token as a credential — it stores the deviceId as a link
   * marker and computes the local expiry.
   */
  async linkExtension(
    projectId: string,
    deviceInfo: DeviceInfo,
    expiresInDays: number = LINK_EXPIRES_DAYS_DEFAULT
  ): Promise<{ accessToken: string; expiresAt: number }> {
    await this.convexMutation(anyApi.projectAccess.linkExtension, {
      projectId,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      expiresInDays,
    });
    return {
      // Link marker (NOT the projectAccess token) — kept only so storage's
      // presence filter treats the project as linked.
      accessToken: deviceInfo.deviceId,
      expiresAt: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    };
  }

  async unlinkExtension(projectId: string, deviceId: string): Promise<void> {
    await this.convexMutation(anyApi.projectAccess.unlinkExtension, {
      projectId,
      deviceId,
    });
  }

  // ============================================
  // Tier / usage — DIRECT Convex
  // ============================================

  /** Check whether extension access is enabled for the organization's tier. */
  async checkExtensionAccess(
    organizationId: string
  ): Promise<{ enabled: boolean; reason?: string }> {
    try {
      const result = await this.convexQuery<CheckFeatureResult>(
        anyApi.featureRegistry.checkFeature,
        { organizationId, featureKey: "extension_access" }
      );
      return {
        enabled: result.allowed,
        reason: result.allowed
          ? undefined
          : (result.reason ?? "Extension access requires Pro tier"),
      };
    } catch (err) {
      captureError(err, { phase: "check-extension-access" });
      return { enabled: false, reason: "Unable to verify extension access" };
    }
  }

  async getUsage(organizationId: string): Promise<UsageInfo | null> {
    const cacheKey = `usage:${organizationId}`;
    const cached = this.getCached<UsageInfo>(cacheKey);
    if (cached) return cached;

    try {
      const membership = await this.convexQuery<MembershipRow | null>(
        anyApi.organizations.getMembership,
        { organizationId }
      );
      if (!membership) {
        return null;
      }

      const [usageData, enforcementEnabled, resolved] = await Promise.all([
        this.convexQuery<OrganizationUsage | null>(
          anyApi.tierLimits.getOrganizationUsage,
          { organizationId }
        ),
        this.convexQuery<boolean>(anyApi.tierLimits.isEnforcementEnabled, {}),
        this.convexQuery<ResolvedFeatures>(
          anyApi.featureRegistry.getResolvedFeatures,
          { organizationId }
        ),
      ]);

      if (!usageData) {
        return null;
      }

      const usage: UsageInfo = {
        tier: (resolved?.tierName === "pro"
          ? "pro"
          : usageData.tier) as UsageInfo["tier"],
        enforcementEnabled,
        limits: {
          projects: ApiService.numericFeature(resolved, "max_projects"),
          variablesPerProject: ApiService.numericFeature(
            resolved,
            "max_variables_per_project"
          ),
          teamMembers: ApiService.numericFeature(resolved, "max_team_members"),
        },
        usage: usageData.usage,
        features: {
          versionHistory: ApiService.booleanFeature(
            resolved,
            "variable_version_history"
          ),
          bulkImport: ApiService.booleanFeature(resolved, "bulk_import"),
          extensionAccess: ApiService.booleanFeature(
            resolved,
            "extension_access",
            true
          ),
          granularPermissions: ApiService.booleanFeature(
            resolved,
            "granular_permissions"
          ),
          auditLogRetentionDays:
            ApiService.numericFeature(resolved, "audit_log_retention_days") ??
            7,
        },
      };

      this.setCached(cacheKey, usage);
      return usage;
    } catch (err) {
      captureError(err, { phase: "get-usage" });
      return null;
    }
  }

  // ============================================
  // Variable requests
  // ============================================

  /** Submit a variable request — DIRECT Convex (value encrypted server-side). */
  async submitVariableRequest(request: {
    key: string;
    value: string;
    description?: string;
    environments: string[];
    projectId: string;
    isSensitive: boolean;
  }): Promise<VariableRequest> {
    // Direct Convex action — replaces the deleted
    // POST /api/extension/variable-requests vault route.
    const created = await this.convexAction<VariableRequest | null>(
      anyApi.variableRequests.createWithValue,
      {
        projectId: request.projectId,
        key: request.key,
        value: request.value,
        environments: request.environments,
        isSensitive: request.isSensitive,
        description: request.description,
      }
    );

    if (!created) {
      throw new Error("Failed to submit variable request");
    }

    return created;
  }

  /** List variable requests for a project — DIRECT Convex. */
  async getVariableRequests(
    projectId: string,
    status?: string
  ): Promise<VariableRequest[]> {
    const args: Record<string, unknown> = { projectId };
    if (status) {
      args.status = status;
    }
    return this.convexQuery<VariableRequest[]>(
      anyApi.variableRequests.listForProject,
      args
    );
  }
}
