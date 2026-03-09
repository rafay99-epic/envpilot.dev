import Conf from "conf";
import type { CLIConfig, User } from "../types/index.js";

// Default API URL - can be overridden via config
const DEFAULT_API_URL = "http://localhost:3000";

// Config store using conf package
const config = new Conf<CLIConfig>({
  projectName: "envpilot",
  defaults: {
    apiUrl: DEFAULT_API_URL,
  },
});

/**
 * Get the full CLI configuration
 */
export function getConfig(): CLIConfig {
  return {
    apiUrl: config.get("apiUrl") ?? DEFAULT_API_URL,
    accessToken: config.get("accessToken"),
    refreshToken: config.get("refreshToken"),
    activeProjectId: config.get("activeProjectId"),
    activeOrganizationId: config.get("activeOrganizationId"),
    user: config.get("user"),
    role: config.get("role"),
  };
}

/**
 * Update CLI configuration
 */
export function setConfig(updates: Partial<CLIConfig>): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      config.delete(key as keyof CLIConfig);
    } else {
      config.set(key as keyof CLIConfig, value);
    }
  }
}

/**
 * Get the API URL
 */
export function getApiUrl(): string {
  return config.get("apiUrl") ?? DEFAULT_API_URL;
}

/**
 * Set the API URL
 */
export function setApiUrl(url: string): void {
  config.set("apiUrl", url);
}

/**
 * Get the access token
 */
export function getAccessToken(): string | undefined {
  return config.get("accessToken");
}

/**
 * Set the access token
 */
export function setAccessToken(token: string): void {
  config.set("accessToken", token);
}

/**
 * Get the refresh token
 */
export function getRefreshToken(): string | undefined {
  return config.get("refreshToken");
}

/**
 * Set the refresh token
 */
export function setRefreshToken(token: string): void {
  config.set("refreshToken", token);
}

/**
 * Get the active project ID
 */
export function getActiveProjectId(): string | undefined {
  return config.get("activeProjectId");
}

/**
 * Set the active project ID
 */
export function setActiveProjectId(projectId: string): void {
  config.set("activeProjectId", projectId);
}

/**
 * Get the active organization ID
 */
export function getActiveOrganizationId(): string | undefined {
  return config.get("activeOrganizationId");
}

/**
 * Set the active organization ID
 */
export function setActiveOrganizationId(organizationId: string): void {
  config.set("activeOrganizationId", organizationId);
}

/**
 * Get the current user
 */
export function getUser(): User | undefined {
  return config.get("user");
}

/**
 * Set the current user
 */
export function setUser(user: User): void {
  config.set("user", user);
}

/**
 * Get the current user's role in the active organization
 */
export function getRole(): string | undefined {
  return config.get("role");
}

/**
 * Set the current user's role in the active organization
 */
export function setRole(role: string): void {
  config.set("role", role);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!config.get("accessToken");
}

/**
 * Clear all authentication data (logout)
 */
export function clearAuth(): void {
  config.delete("accessToken");
  config.delete("refreshToken");
  config.delete("user");
  config.delete("role");
}

/**
 * Clear all configuration
 */
export function clearConfig(): void {
  config.clear();
}

/**
 * Get the config file path (for debugging)
 */
export function getConfigPath(): string {
  return config.path;
}
