import Conf from "conf";
import type { Account, CLIConfig, User } from "../types/index.js";
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

// ============================================================================
// Multi-account core
// ============================================================================
//
// Auth state lives in `accounts` (keyed by account id == user id) with one
// `activeAccountId` pointer. All the legacy token/user/role getters/setters are
// thin wrappers that operate on the ACTIVE account so existing callers keep
// working unchanged. `apiUrl` remains a single global setting.

/**
 * Pure, idempotent migration of a config snapshot from the legacy flat shape
 * (top-level accessToken/user/role/…) into the multi-account shape.
 *
 * If `accounts` is absent/empty AND a legacy `accessToken` exists, an Account
 * is synthesized from the legacy fields and made active. Any legacy top-level
 * auth fields are then stripped so `accounts` is the single source of truth.
 * `apiUrl` is preserved untouched.
 *
 * Exported (alongside the store-backed `migrateLegacyConfig`) so tests can
 * exercise the transform against a synthetic object without touching the real
 * on-disk store. Safe to call repeatedly.
 */
export function migrateLegacyConfigData(data: CLIConfig): CLIConfig {
  const accounts: Record<string, Account> = { ...(data.accounts ?? {}) };
  const hasAccounts = Object.keys(accounts).length > 0;

  let activeAccountId = data.activeAccountId;

  // Only create an account from legacy fields when there are none yet and a
  // legacy access token is present — otherwise there's no session to preserve.
  if (!hasAccounts && data.accessToken) {
    const legacyUser = data.user;
    const id =
      legacyUser?.id ??
      (data.accessToken.length >= 8
        ? `legacy-${data.accessToken.slice(0, 8)}`
        : "default");
    const user: User = legacyUser ?? { id, email: `${id}@cli.local` };
    accounts[id] = {
      id,
      user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      role: data.role,
      activeOrganizationId: data.activeOrganizationId,
      activeProjectId: data.activeProjectId,
    };
    activeAccountId = id;
  }

  // Rebuild the snapshot with legacy top-level auth fields removed.
  const result: CLIConfig = { ...data, accounts, activeAccountId };
  delete result.accessToken;
  delete result.refreshToken;
  delete result.user;
  delete result.role;
  delete result.activeOrganizationId;
  delete result.activeProjectId;
  return result;
}

/**
 * Run {@link migrateLegacyConfigData} against the persisted store, in place.
 * Lazy + idempotent: called at the start of every account read. Only writes
 * when legacy fields are actually present, so it's a no-op once migrated.
 */
export function migrateLegacyConfig(): void {
  const data = config.store as CLIConfig;
  const hadLegacy =
    data.accessToken !== undefined ||
    data.refreshToken !== undefined ||
    data.user !== undefined ||
    data.role !== undefined ||
    data.activeOrganizationId !== undefined ||
    data.activeProjectId !== undefined;
  if (!hadLegacy) return;
  config.store = migrateLegacyConfigData(data);
}

/** Read the accounts record from the store (never undefined). */
function readAccounts(): Record<string, Account> {
  return config.get("accounts") ?? {};
}

/** Persist the accounts record. */
function writeAccounts(accounts: Record<string, Account>): void {
  config.set("accounts", accounts);
}

/**
 * List all logged-in accounts.
 */
export function listAccounts(): Account[] {
  migrateLegacyConfig();
  return Object.values(readAccounts());
}

/**
 * Get the currently active account, running legacy migration first so a
 * pre-multi-account session is transparently preserved.
 */
export function getActiveAccount(): Account | undefined {
  migrateLegacyConfig();
  const id = config.get("activeAccountId");
  if (!id) return undefined;
  return readAccounts()[id];
}

/**
 * Get the active account id.
 */
export function getActiveAccountId(): string | undefined {
  migrateLegacyConfig();
  return config.get("activeAccountId");
}

/**
 * Switch the active account. Returns false (and changes nothing) if no account
 * with the given id exists.
 */
export function setActiveAccount(id: string): boolean {
  const accounts = readAccounts();
  if (!accounts[id]) return false;
  config.set("activeAccountId", id);
  return true;
}

/**
 * Add or replace an account (keyed by id). If it's the first account stored,
 * it also becomes the active account.
 */
export function upsertAccount(account: Account): void {
  const accounts = readAccounts();
  const isFirst = Object.keys(accounts).length === 0;
  accounts[account.id] = account;
  writeAccounts(accounts);
  if (isFirst) {
    config.set("activeAccountId", account.id);
  }
}

/**
 * Remove an account. If it was the active one, the active pointer moves to
 * another remaining account (or is cleared when none remain).
 */
export function removeAccount(id: string): {
  removedActive: boolean;
  newActiveId?: string;
} {
  const accounts = readAccounts();
  if (!accounts[id]) {
    return { removedActive: false };
  }

  const wasActive = config.get("activeAccountId") === id;
  delete accounts[id];
  writeAccounts(accounts);

  let newActiveId: string | undefined;
  if (wasActive) {
    newActiveId = Object.keys(accounts)[0];
    if (newActiveId) {
      config.set("activeAccountId", newActiveId);
    } else {
      config.delete("activeAccountId");
    }
  }

  return { removedActive: wasActive, newActiveId };
}

/**
 * Apply a partial update to the active account. No-op when there is no active
 * account. The account id is never changed by a patch.
 */
export function updateActiveAccount(patch: Partial<Account>): void {
  migrateLegacyConfig();
  const id = config.get("activeAccountId");
  if (!id) return;
  const accounts = readAccounts();
  const existing = accounts[id];
  if (!existing) return;
  accounts[id] = { ...existing, ...patch, id: existing.id };
  writeAccounts(accounts);
}

/**
 * Get the full CLI configuration. The auth fields reflect the ACTIVE account
 * (back-compat for callers/tests that read them off the flat config shape).
 */
export function getConfig(): CLIConfig {
  const active = getActiveAccount();
  return {
    apiUrl: normalizeApiUrl(config.get("apiUrl") ?? DEFAULT_API_URL),
    accounts: readAccounts(),
    activeAccountId: config.get("activeAccountId"),
    accessToken: active?.accessToken,
    refreshToken: active?.refreshToken,
    activeProjectId: active?.activeProjectId,
    activeOrganizationId: active?.activeOrganizationId,
    user: active?.user,
    role: active?.role,
  };
}

/**
 * Update CLI configuration. Only global keys (`apiUrl`, `accounts`,
 * `activeAccountId`) are written directly; the legacy per-account auth fields
 * are routed onto the active account so back-compat writes don't resurrect the
 * flat shape.
 */
export function setConfig(updates: Partial<CLIConfig>): void {
  const accountPatch: Partial<Account> = {};
  let hasAccountPatch = false;

  for (const [key, value] of Object.entries(updates)) {
    switch (key) {
      case "apiUrl":
      case "accounts":
      case "activeAccountId":
        if (value === undefined) {
          config.delete(key as keyof CLIConfig);
        } else {
          config.set(key as keyof CLIConfig, value);
        }
        break;
      // Legacy auth fields → route onto the active account.
      case "accessToken":
      case "refreshToken":
      case "role":
      case "activeOrganizationId":
      case "activeProjectId":
      case "user":
        (accountPatch as Record<string, unknown>)[key] = value;
        hasAccountPatch = true;
        break;
      default:
        break;
    }
  }

  if (hasAccountPatch) {
    updateActiveAccount(accountPatch);
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
 * Get the active account's access token.
 */
export function getAccessToken(): string | undefined {
  return getActiveAccount()?.accessToken;
}

/**
 * Get the active account's active project ID.
 */
export function getActiveProjectId(): string | undefined {
  return getActiveAccount()?.activeProjectId;
}

/**
 * Set the active account's active project ID.
 */
export function setActiveProjectId(projectId: string): void {
  updateActiveAccount({ activeProjectId: projectId });
}

/**
 * Get the active account's active organization ID.
 */
export function getActiveOrganizationId(): string | undefined {
  return getActiveAccount()?.activeOrganizationId;
}

/**
 * Set the active account's active organization ID.
 */
export function setActiveOrganizationId(organizationId: string): void {
  updateActiveAccount({ activeOrganizationId: organizationId });
}

/**
 * Get the active account's user.
 */
export function getUser(): User | undefined {
  return getActiveAccount()?.user;
}

/**
 * Set the active account's user.
 */
export function setUser(user: User): void {
  updateActiveAccount({ user });
}

/**
 * Get the raw stored role string (legacy or unified) without normalization.
 * Thin back-compat wrapper — prefer getUnifiedRole() for access decisions.
 */
export function getRole(): string | undefined {
  return getActiveAccount()?.role;
}

/**
 * Store a role string verbatim. Thin back-compat wrapper — prefer
 * setUnifiedRole() so callers pass a unified OrgRole.
 */
export function setRole(role: string): void {
  updateActiveAccount({ role });
}

/**
 * Get the current user's role in the active organization, normalized onto the
 * unified model. A stored legacy value ("admin"/"member"/…) is mapped to its
 * unified equivalent ("owner"/"developer"/…) so callers never see legacy roles.
 * Falls back to "developer" (least privilege) when nothing is stored.
 */
export function getUnifiedRole(): OrgRole {
  return normalizeOrgRole(getActiveAccount()?.role);
}

/**
 * Persist the current user's unified org role onto the active account.
 * getRole()/getUnifiedRole() both read it back.
 */
export function setUnifiedRole(role: OrgRole): void {
  updateActiveAccount({ role });
}

/**
 * Check if the user is authenticated (i.e. there is an active account).
 */
export function isAuthenticated(): boolean {
  return getActiveAccount() !== undefined;
}

/**
 * Log out of the CURRENT account: remove the active account and purge the run
 * cache. Returns the id of the account that became active afterwards (if any),
 * so the logout command can tell the user which account they're now on.
 */
export function clearAuth(): { newActiveId?: string } {
  const id = getActiveAccountId();
  const result = id ? removeAccount(id) : { newActiveId: undefined };
  // Purge the fingerprint-gated run cache so a different user (or a re-login)
  // can never be served another account's decrypted secrets.
  try {
    clearRunCache();
  } catch {
    // Non-fatal — cache is a performance aid, not load-bearing.
  }
  return { newActiveId: result.newActiveId };
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
