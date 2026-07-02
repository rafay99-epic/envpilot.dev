import Conf from "conf";
import type { CLIConfig, User } from "../types/index.js";
import { normalizeOrgRole, type OrgRole } from "./roles.js";
import { clearRunCache } from "./variables-cache.js";

// Default API URL - production by default, can be overridden via config
const DEFAULT_API_URL = "https://www.envpilot.dev";

// Hosts that should always be canonicalized to their www equivalent.
// The apex domain (envpilot.dev) 307-redirects to www.envpilot.dev, and
// Node's fetch strips the Authorization header across that hostname change,
// which leads to false 401s on authenticated requests. We bake the canonical
// form into the config so users can never accidentally set the apex host.
const HOST_CANONICALIZATION: Record<string, string> = {
  "envpilot.dev": "www.envpilot.dev",
};

/**
 * Normalize a user-provided API URL so it points at a host that won't
 * cross-origin-redirect and strip auth headers. Also strips trailing slashes
 * so URL construction is predictable.
 *
 * Exported so that other modules (e.g. the `config set` command) can
 * validate and display the canonical URL before storing.
 */
export function normalizeApiUrl(raw: string): string {
  let value = raw.trim();
  // Assume https if no scheme was given
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const parsed = new URL(value);
    const canonicalHost = HOST_CANONICALIZATION[parsed.hostname.toLowerCase()];
    if (canonicalHost) {
      parsed.hostname = canonicalHost;
    }
    // Drop trailing slashes in the path so `new URL(path, base)` behaves.
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    // Serialize without a dangling slash
    return parsed.toString().replace(/\/$/, "");
  } catch {
    // Fall back to raw input if URL parsing fails — callers will surface
    // the error when the request actually goes out.
    return value;
  }
}

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
    apiUrl: normalizeApiUrl(config.get("apiUrl") ?? DEFAULT_API_URL),
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
  const stored = config.get("apiUrl");
  const raw = stored ?? DEFAULT_API_URL;
  // Normalize on read too, so configs written by older CLI versions that
  // stored the apex host (envpilot.dev) are transparently fixed.
  return normalizeApiUrl(raw);
}

/**
 * Set the API URL
 */
export function setApiUrl(url: string): void {
  config.set("apiUrl", normalizeApiUrl(url));
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
 * Get the raw stored role string (legacy or unified) without normalization.
 * Thin back-compat wrapper — prefer getUnifiedRole() for access decisions.
 */
export function getRole(): string | undefined {
  return config.get("role");
}

/**
 * Store a role string verbatim. Thin back-compat wrapper — prefer
 * setUnifiedRole() so callers pass a unified OrgRole.
 */
export function setRole(role: string): void {
  config.set("role", role);
}

/**
 * Get the current user's role in the active organization, normalized onto the
 * unified model. A stored legacy value ("admin"/"member"/…) is mapped to its
 * unified equivalent ("owner"/"developer"/…) so callers never see legacy roles.
 * Falls back to "developer" (least privilege) when nothing is stored.
 */
export function getUnifiedRole(): OrgRole {
  return normalizeOrgRole(config.get("role"));
}

/**
 * Persist the current user's unified org role. Written to the same `role`
 * field so getRole()/getUnifiedRole() both read it back.
 */
export function setUnifiedRole(role: OrgRole): void {
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
  // Purge the fingerprint-gated run cache so a different user (or a re-login)
  // can never be served another account's decrypted secrets.
  try {
    clearRunCache();
  } catch {
    // Non-fatal — cache is a performance aid, not load-bearing.
  }
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
