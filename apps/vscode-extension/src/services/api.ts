import * as vscode from "vscode";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { getConvexUrl } from "../utils/config";
import { SingleFlight } from "../utils/singleFlight";
import { TokenManager, TransientAuthError } from "./tokenManager";
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

export type SecretFileRow = {
  _id: string;
  name: string;
  path: string;
  mode: string;
  contentType?: string;
  size: number;
  sha256: string;
  digestSalt: string;
  description?: string;
  environments: string[];
  projectId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  access: "read" | "write";
};

export type SecretFileContent = {
  name: string;
  path: string;
  mode: string;
  size: number;
  sha256: string;
  contentType?: string;
  content: string;
};

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
    truncatedAt?: number;
    autoUnsyncOnClose?: boolean;
    capabilities?: Record<string, boolean>;
  };
}

type AccessMeta = Partial<
  Pick<
    PullValuesResult["meta"],
    | "unifiedRole"
    | "assigned"
    | "environmentScope"
    | "hasWriteAccess"
    | "scopeRestricted"
    | "autoUnsyncOnClose"
    | "capabilities"
  >
>;

const LINK_EXPIRES_DAYS_DEFAULT = 30;
const ACCESS_REVOKED_MESSAGE =
  "Your access to this organization has been revoked. Please contact your organization.";

export function assertCompletePull(meta: PullValuesResult["meta"]): void {
  const failed = meta.decryptionFailures ?? [];
  if (failed.length > 0) {
    throw new Error(
      `Envpilot could not decrypt ${failed.join(", ")}. Nothing was written. Try again, or ask a project owner to re-save these values.`
    );
  }
  if (meta.truncatedAt !== undefined) {
    throw new Error(
      `This environment has more than ${meta.truncatedAt} variables, more than one pull can return. Nothing was written.`
    );
  }
}

function isSessionExpired(err: unknown): boolean {
  if (err instanceof TransientAuthError) return false;
  if ((err as { status?: number })?.status === 401) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /unauthenticated|unauthorized|not signed in|invalid or expired bearer|no auth provider/i.test(
    message
  );
}

function isAccessSuspended(err: unknown): boolean {
  const data = (err as { data?: unknown })?.data;
  const message = err instanceof Error ? err.message : String(err);
  return `${message} ${typeof data === "string" ? data : ""}`.includes(
    "ACCESS_SUSPENDED"
  );
}

export class ApiService {
  private tokenManager: TokenManager;
  private roleCache: Map<string, string> = new Map();
  private projectRoleCache: Map<string, string> = new Map();
  private accessMetaCache: Map<string, AccessMeta> = new Map();
  private responseCache: Map<string, { at: number; value: unknown }> =
    new Map();
  private static readonly CACHE_TTL_MS = 30_000;
  private inflight = new SingleFlight();
  private cacheGeneration = 0;
  private reauthPromptActive = false;
  private convex: {
    url: string;
    token: string;
    client: ConvexHttpClient;
  } | null = null;

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  private async getConvexClient(
    forceRefresh: boolean
  ): Promise<ConvexHttpClient> {
    const url = getConvexUrl();
    if (!url) {
      throw new Error(
        "No Convex URL available. Set envpilot.convexUrl or reinstall the extension."
      );
    }
    const token = await this.tokenManager.getFreshToken(forceRefresh);
    if (!token) {
      throw Object.assign(new Error("You are not signed in."), { status: 401 });
    }
    if (this.convex?.token !== token || this.convex.url !== url) {
      const client = new ConvexHttpClient(url);
      client.setAuth(token);
      this.convex = { url, token, client };
    }
    return this.convex.client;
  }

  async listSecretFiles(
    projectId: string,
    environment?: string
  ): Promise<SecretFileRow[]> {
    return this.convexQuery<SecretFileRow[]>(
      anyApi.features.files.queries.list,
      { projectId, ...(environment ? { environment } : {}) }
    );
  }

  async getSecretFileContent(fileId: string): Promise<SecretFileContent> {
    return this.convexAction<SecretFileContent>(
      anyApi.features.files.values.getFileContent,
      { fileId, source: "extension" }
    );
  }

  private convexQuery<T>(
    ref: unknown,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    return this.call(
      (client) => client.query(ref as never, args as never) as Promise<T>
    );
  }

  private convexMutation<T>(
    ref: unknown,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    return this.call(
      (client) => client.mutation(ref as never, args as never) as Promise<T>
    );
  }

  private convexAction<T>(
    ref: unknown,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    return this.call(
      (client) => client.action(ref as never, args as never) as Promise<T>
    );
  }

  private async call<T>(
    run: (client: ConvexHttpClient) => Promise<T>
  ): Promise<T> {
    const attempt = async (forceRefresh: boolean) =>
      run(await this.getConvexClient(forceRefresh));
    try {
      return await attempt(false).catch((err: unknown) => {
        if (!isSessionExpired(err)) throw err;
        return attempt(true);
      });
    } catch (err) {
      if (isSessionExpired(err)) {
        void this.promptReauth();
      }
      if (isAccessSuspended(err)) {
        throw Object.assign(new Error(ACCESS_REVOKED_MESSAGE), { status: 403 });
      }
      throw err;
    }
  }

  private async promptReauth(): Promise<void> {
    if (this.reauthPromptActive) {
      return;
    }
    this.reauthPromptActive = true;
    try {
      const action = await vscode.window.showWarningMessage(
        "Envpilot: Session expired. Sign in again to continue.",
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

  clearCache(): void {
    this.cacheGeneration++;
    this.responseCache.clear();
    this.inflight.clear();
    this.roleCache.clear();
    this.projectRoleCache.clear();
    this.accessMetaCache.clear();
    this.convex = null;
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

  async getOrganizations(): Promise<Organization[]> {
    const cached = this.getCached<Organization[]>("orgs");
    if (cached) return cached;

    return this.coalesce("orgs", async () => {
      const gen = this.cacheGeneration;
      const orgs = await this.convexQuery<OrgRow[]>(
        anyApi.features.organizations.queries.listForUser,
        {}
      );

      const orgIds = orgs.map((o) => o._id);
      let tiers: ResolvedFeatures[] = [];
      if (orgIds.length > 0) {
        try {
          tiers = await this.convexQuery<ResolvedFeatures[]>(
            anyApi.features.featureRegistry.queries.getResolvedFeaturesBatch,
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
        tier: tiers[index]?.tierName === "pro" ? "pro" : "free",
        unifiedRole: normalizeOrgRole(org.role),
      }));

      if (gen === this.cacheGeneration) {
        this.setCached("orgs", organizations);
      }
      return organizations;
    });
  }

  async getProjects(organizationId?: string): Promise<Project[]> {
    const cacheKey = `projects:${organizationId ?? "all"}`;
    const cached = this.getCached<Project[]>(cacheKey);
    if (cached) return cached;

    return this.coalesce(cacheKey, async () => {
      const gen = this.cacheGeneration;
      const projects = organizationId
        ? await this.listProjectsForOrg(organizationId)
        : await this.listAllProjects();

      if (gen === this.cacheGeneration) {
        for (const project of projects) {
          if (project.unifiedRole) {
            this.roleCache.set(project._id, project.unifiedRole);
          }
          if (project.projectRole) {
            this.projectRoleCache.set(project._id, project.projectRole);
          }
        }

        this.setCached(cacheKey, projects);
      }
      return projects;
    });
  }

  private async listProjectsForOrg(organizationId: string): Promise<Project[]> {
    const [projects, membership] = await Promise.all([
      this.convexQuery<ProjectRow[]>(
        anyApi.features.projects.queries.listWithStats,
        { organizationId }
      ),
      this.convexQuery<MembershipRow | null>(
        anyApi.features.organizations.queries.getMembership,
        { organizationId }
      ),
    ]);

    const unifiedRole = normalizeOrgRole(membership?.role);
    return Promise.all(
      projects.map((project) => this.mapProject(project, unifiedRole))
    );
  }

  private async listAllProjects(): Promise<Project[]> {
    const projects = await this.convexQuery<ProjectRow[]>(
      anyApi.features.projects.queries.listForUser,
      {}
    );
    return Promise.all(
      projects.map((project) =>
        this.mapProject(project, normalizeOrgRole(project.userRole))
      )
    );
  }

  private async mapProject(
    project: ProjectRow,
    unifiedRole: ReturnType<typeof normalizeOrgRole>
  ): Promise<Project> {
    const isOwner = unifiedRole === "owner";
    const projectMembership = isOwner
      ? null
      : await this.convexQuery<ProjectMembershipRow | null>(
          anyApi.features.projects.members.getProjectMembership,
          { projectId: project._id }
        );

    return {
      _id: project._id,
      name: project.name,
      slug: project.slug,
      description: project.description ?? null,
      organizationId: project.organizationId,
      icon: project.icon ?? null,
      color: project.color ?? null,
      userRole: null,
      projectRole: isOwner
        ? null
        : unifiedRole === "developer"
          ? "developer"
          : "manager",
      unifiedRole,
      assigned: isOwner || projectMembership !== null,
      environmentScope:
        unifiedRole === "developer"
          ? (projectMembership?.environments ?? null)
          : null,
    };
  }

  getVariables(
    projectId: string,
    environment: string,
    organizationId?: string,
    options?: { fresh?: boolean }
  ): Promise<EnvironmentVariable[]> {
    return this.pullValues(
      `vars:${projectId}:${environment}:${organizationId ?? ""}`,
      { projectId, environment },
      options?.fresh ?? false
    );
  }

  getVariablesMetadata(
    projectId: string,
    environment: string,
    organizationId?: string
  ): Promise<EnvironmentVariable[]> {
    return this.pullValues(
      `varsmeta:${projectId}:${environment}:${organizationId ?? ""}`,
      { projectId, environment, metadataOnly: true },
      false
    );
  }

  private async pullValues(
    cacheKey: string,
    args: { projectId: string; environment: string; metadataOnly?: true },
    fresh: boolean
  ): Promise<EnvironmentVariable[]> {
    if (!fresh) {
      const cached = this.getCached<EnvironmentVariable[]>(cacheKey);
      if (cached) return cached;
    }

    return this.coalesce(cacheKey, async () => {
      const gen = this.cacheGeneration;
      const result = await this.convexAction<PullValuesResult>(
        anyApi.features.variables.values.pullValues,
        args
      );
      assertCompletePull(result.meta);

      const variables = result.variables.map(
        (row): EnvironmentVariable => ({
          _id: row._id,
          key: row.key,
          value: row.value,
          description: row.description ?? null,
          environments: row.environments,
          projectId: row.projectId,
          isSensitive: row.isSensitive,
          version: row.version,
          access: row.access,
        })
      );
      if (gen === this.cacheGeneration) {
        const { meta } = result;
        this.roleCache.set(args.projectId, meta.role);
        this.accessMetaCache.set(args.projectId, {
          unifiedRole: meta.unifiedRole,
          assigned: meta.assigned,
          environmentScope: meta.environmentScope,
          hasWriteAccess: meta.hasWriteAccess,
          scopeRestricted: meta.scopeRestricted,
          autoUnsyncOnClose: meta.autoUnsyncOnClose,
          capabilities: meta.capabilities,
        });
        this.setCached(cacheKey, variables);
      }
      return variables;
    });
  }

  getAccessMeta(projectId: string): AccessMeta | undefined {
    return this.accessMetaCache.get(projectId);
  }

  async reportUnsync(
    reports: Array<{
      projectId: string;
      deletedCount: number;
      sparedCount: number;
      trigger: "close" | "crash-sweep";
      occurredAt: number;
    }>
  ): Promise<void> {
    await this.convexMutation(
      anyApi.features.users.projectAccess.reportUnsync,
      { reports }
    );
  }

  getUserRole(projectId: string): string | undefined {
    return this.roleCache.get(projectId);
  }

  getProjectRole(projectId: string): string | undefined {
    return this.projectRoleCache.get(projectId);
  }

  async linkExtension(
    projectId: string,
    deviceInfo: DeviceInfo,
    expiresInDays: number = LINK_EXPIRES_DAYS_DEFAULT
  ): Promise<{ accessToken: string; expiresAt: number }> {
    await this.convexMutation(
      anyApi.features.users.projectAccess.linkExtension,
      {
        projectId,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        expiresInDays,
      }
    );
    return {
      accessToken: deviceInfo.deviceId,
      expiresAt: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    };
  }

  async unlinkExtension(projectId: string, deviceId: string): Promise<void> {
    await this.convexMutation(
      anyApi.features.users.projectAccess.unlinkExtension,
      { projectId, deviceId }
    );
  }

  async checkExtensionAccess(
    organizationId: string
  ): Promise<{ enabled: boolean; reason?: string }> {
    try {
      const result = await this.convexQuery<CheckFeatureResult>(
        anyApi.features.featureRegistry.queries.checkFeature,
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
      return { enabled: true };
    }
  }

  async getUsage(organizationId: string): Promise<UsageInfo | null> {
    const cacheKey = `usage:${organizationId}`;
    const cached = this.getCached<UsageInfo>(cacheKey);
    if (cached) return cached;
    const gen = this.cacheGeneration;

    try {
      const membership = await this.convexQuery<MembershipRow | null>(
        anyApi.features.organizations.queries.getMembership,
        { organizationId }
      );
      if (!membership) {
        return null;
      }

      const [usageData, enforcementEnabled, resolved] = await Promise.all([
        this.convexQuery<OrganizationUsage | null>(
          anyApi.features.billing.tierLimits.getOrganizationUsage,
          { organizationId }
        ),
        this.convexQuery<boolean>(
          anyApi.features.billing.tierLimits.isEnforcementEnabled,
          {}
        ),
        this.convexQuery<ResolvedFeatures>(
          anyApi.features.featureRegistry.queries.getResolvedFeatures,
          { organizationId }
        ),
      ]);

      if (!usageData) {
        return null;
      }

      const usage: UsageInfo = {
        tier: resolved?.tierName === "pro" ? "pro" : usageData.tier,
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

      if (gen === this.cacheGeneration) {
        this.setCached(cacheKey, usage);
      }
      return usage;
    } catch (err) {
      captureError(err, { phase: "get-usage" });
      return null;
    }
  }

  async submitVariableRequest(request: {
    key: string;
    value: string;
    description?: string;
    environments: string[];
    projectId: string;
    isSensitive: boolean;
  }): Promise<VariableRequest> {
    const created = await this.convexAction<VariableRequest | null>(
      anyApi.features.variables.requests.actions.createWithValue,
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

  async getVariableRequests(
    projectId: string,
    status?: VariableRequest["status"]
  ): Promise<VariableRequest[]> {
    return this.convexQuery<VariableRequest[]>(
      anyApi.features.variables.requests.queries.listForProject,
      status ? { projectId, status } : { projectId }
    );
  }
}
