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
} from "../types";

/**
 * API service for communicating with the Envpilot backend
 */
export class ApiService {
  private client: AxiosInstance;
  private storage: StorageService;
  private roleCache: Map<string, MembershipRole> = new Map();
  private projectRoleCache: Map<string, ProjectRole> = new Map();

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

  // Organizations
  async getOrganizations(): Promise<Organization[]> {
    const response = await this.client.get<
      ApiResponse<{ organizations: Organization[] }>
    >("/api/extension/organizations");
    return response.data.data?.organizations || [];
  }

  // Projects
  async getProjects(organizationId?: string): Promise<Project[]> {
    const response = await this.client.get<
      ApiResponse<{ projects: Project[] }>
    >("/api/extension/projects", {
      params: organizationId ? { organizationId } : undefined,
    });
    const projects = response.data.data?.projects || [];

    // Cache project roles from the response
    for (const project of projects) {
      if (project.projectRole) {
        this.projectRoleCache.set(project._id, project.projectRole);
      }
    }

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
    organizationId?: string
  ): Promise<EnvironmentVariable[]> {
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

    return response.data.data?.variables || [];
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
