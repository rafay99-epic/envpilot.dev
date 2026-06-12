import axios, { AxiosInstance, AxiosError } from "axios";
import { getServerUrl } from "../utils/config";
import { StorageService } from "../utils/storage";
import type {
  Organization,
  Project,
  EnvironmentVariable,
  ProjectAccess,
  TokenValidation,
  ApiResponse,
  DeviceInfo,
  MembershipRole,
  ProjectRole,
  VariableRequest,
  UsageInfo,
} from "../types";

/**
 * API service for communicating with the Envpilot backend
 */
export class ApiService {
  private client: AxiosInstance;
  private storage: StorageService;
  private roleCache: Map<string, MembershipRole> = new Map();
  private projectRoleCache: Map<string, ProjectRole> = new Map();
  /**
   * Short-TTL response cache. One sync triggers refreshes of the variables
   * tree, dashboard panel, and status bar — without this, each refresh
   * re-fetches identical data (including vault-decrypted variables).
   */
  private responseCache: Map<string, { at: number; value: unknown }> =
    new Map();
  private static readonly CACHE_TTL_MS = 30_000;

  constructor(storage: StorageService) {
    this.storage = storage;
    this.client = axios.create({
      timeout: 30000,
    });

    // Add auth interceptor
    this.client.interceptors.request.use(async (config) => {
      config.baseURL = getServerUrl();
      const session = await this.storage.getAuthSession();
      if (session?.accessToken) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<{ error?: string }>) => {
        const message = error.response?.data?.error || error.message;
        throw new Error(message);
      }
    );
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

  /** Drop all cached responses (manual refresh, sign-out). */
  clearCache(): void {
    this.responseCache.clear();
  }

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const cached = this.getCached<Organization[]>("orgs");
    if (cached) return cached;

    const response = await this.client.get<
      ApiResponse<{ organizations: Organization[] }>
    >("/api/extension/organizations");
    const organizations = response.data.data?.organizations || [];
    this.setCached("orgs", organizations);
    return organizations;
  }

  // Projects
  async getProjects(organizationId?: string): Promise<Project[]> {
    const cacheKey = `projects:${organizationId ?? "all"}`;
    const cached = this.getCached<Project[]>(cacheKey);
    if (cached) return cached;

    const response = await this.client.get<
      ApiResponse<{ projects: Project[] }>
    >("/api/extension/projects", {
      params: organizationId ? { organizationId } : undefined,
    });
    const projects = response.data.data?.projects || [];

    // Cache both org-level and project-level roles from the response
    for (const project of projects) {
      if (project.userRole) {
        this.roleCache.set(project._id, project.userRole);
      }
      if (project.projectRole) {
        this.projectRoleCache.set(project._id, project.projectRole);
      }
    }

    this.setCached(cacheKey, projects);
    return projects;
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const response = await this.client.get<ApiResponse<{ project: Project }>>(
        `/api/extension/projects/${projectId}`
      );
      return response.data.data?.project || null;
    } catch {
      return null;
    }
  }

  // Variables
  async getVariables(
    projectId: string,
    environment: string,
    accessToken?: string,
    organizationId?: string,
    options?: { fresh?: boolean }
  ): Promise<EnvironmentVariable[]> {
    const cacheKey = `vars:${projectId}:${environment}:${organizationId ?? ""}`;
    if (!options?.fresh) {
      const cached = this.getCached<EnvironmentVariable[]>(cacheKey);
      if (cached) return cached;
    }

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers["X-Access-Token"] = accessToken;
    }

    const params: Record<string, string> = { projectId, environment };
    if (organizationId) {
      params.organizationId = organizationId;
    }

    const response = await this.client.get<
      ApiResponse<{ variables: EnvironmentVariable[]; role?: MembershipRole }>
    >("/api/extension/variables", {
      params,
      headers,
    });

    // Cache the user's role for this project
    if (response.data.data?.role) {
      this.roleCache.set(projectId, response.data.data.role);
    }

    const variables = response.data.data?.variables || [];
    this.setCached(cacheKey, variables);
    return variables;
  }

  /**
   * Variable metadata only — `value` is always empty. Used by UI surfaces
   * (tree view, dashboard) that never display values: skips per-variable
   * vault decryption on the server, which is the slow part of getVariables,
   * and avoids logging spurious "export" audit events for mere rendering.
   */
  async getVariablesMetadata(
    projectId: string,
    environment: string,
    accessToken?: string,
    organizationId?: string
  ): Promise<EnvironmentVariable[]> {
    const cacheKey = `varsmeta:${projectId}:${environment}:${organizationId ?? ""}`;
    const cached = this.getCached<EnvironmentVariable[]>(cacheKey);
    if (cached) return cached;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers["X-Access-Token"] = accessToken;
    }

    const params: Record<string, string> = {
      projectId,
      environment,
      metadataOnly: "true",
    };
    if (organizationId) {
      params.organizationId = organizationId;
    }

    const response = await this.client.get<
      ApiResponse<{ variables: EnvironmentVariable[]; role?: MembershipRole }>
    >("/api/extension/variables", {
      params,
      headers,
    });

    if (response.data.data?.role) {
      this.roleCache.set(projectId, response.data.data.role);
    }

    const variables = response.data.data?.variables || [];
    this.setCached(cacheKey, variables);
    return variables;
  }

  /**
   * Get the cached org role for a project (populated after getVariables call)
   */
  getUserRole(projectId: string): MembershipRole | undefined {
    return this.roleCache.get(projectId);
  }

  /**
   * Get the cached project role (populated after getProjects call)
   */
  getProjectRole(projectId: string): ProjectRole | undefined {
    return this.projectRoleCache.get(projectId);
  }

  // Project Access (Extension Linking)
  async linkExtension(
    projectId: string,
    deviceInfo: DeviceInfo,
    expiresInDays?: number
  ): Promise<ProjectAccess> {
    const response = await this.client.post<
      ApiResponse<{ access: ProjectAccess }>
    >("/api/extension/link", {
      projectId,
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      expiresInDays: expiresInDays || 30,
    });

    if (!response.data.data?.access) {
      throw new Error("Failed to link extension");
    }

    return response.data.data.access;
  }

  async unlinkExtension(projectId: string, deviceId: string): Promise<void> {
    await this.client.post("/api/extension/unlink", {
      projectId,
      deviceId,
    });
  }

  async validateAccessToken(accessToken: string): Promise<TokenValidation> {
    const response = await this.client.post<ApiResponse<TokenValidation>>(
      "/api/extension/validate-token",
      { accessToken }
    );

    return (
      response.data.data || {
        valid: false,
        reason: "Invalid response from server",
      }
    );
  }

  async refreshAccessToken(
    accessToken: string,
    expiresInDays?: number
  ): Promise<{ expiresAt: number }> {
    const response = await this.client.post<ApiResponse<{ expiresAt: number }>>(
      "/api/extension/refresh-token",
      { accessToken, expiresInDays: expiresInDays || 30 }
    );

    if (!response.data.data?.expiresAt) {
      throw new Error("Failed to refresh access token");
    }

    return { expiresAt: response.data.data.expiresAt };
  }

  async updateLastUsed(accessToken: string): Promise<void> {
    await this.client.post("/api/extension/update-last-used", { accessToken });
  }

  // Check if extension access is enabled for the organization's tier
  async checkExtensionAccess(
    organizationId: string
  ): Promise<{ enabled: boolean; reason?: string }> {
    const response = await this.client.get<
      ApiResponse<{ enabled: boolean; reason?: string }>
    >(`/api/extension/check-access/${organizationId}`);
    return response.data.data || { enabled: false, reason: "Unknown error" };
  }

  // Usage info
  async getUsage(organizationId: string): Promise<UsageInfo | null> {
    const cacheKey = `usage:${organizationId}`;
    const cached = this.getCached<UsageInfo>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get<ApiResponse<UsageInfo>>(
        "/api/extension/usage",
        { params: { organizationId } }
      );
      const usage = response.data.data || null;
      if (usage) {
        this.setCached(cacheKey, usage);
      }
      return usage;
    } catch {
      return null;
    }
  }

  // Variable Requests

  /**
   * Submit a variable request (members only)
   */
  async submitVariableRequest(request: {
    key: string;
    value: string;
    description?: string;
    environments: string[];
    projectId: string;
    isSensitive: boolean;
  }): Promise<VariableRequest> {
    const response = await this.client.post<
      ApiResponse<{ request: VariableRequest }>
    >("/api/extension/variable-requests", request);

    if (!response.data.data?.request) {
      throw new Error("Failed to submit variable request");
    }

    return response.data.data.request;
  }

  /**
   * Get variable requests for a project
   */
  async getVariableRequests(
    projectId: string,
    status?: string
  ): Promise<VariableRequest[]> {
    const response = await this.client.get<
      ApiResponse<{ requests: VariableRequest[] }>
    >("/api/extension/variable-requests", {
      params: { projectId, status },
    });
    return response.data.data?.requests || [];
  }
}
