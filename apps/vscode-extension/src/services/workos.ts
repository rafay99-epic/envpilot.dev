// WorkOS AuthKit device authorization flow, over raw HTTP (no SDK).
//
// This replaces the old browser-OAuth-poll login. The extension now obtains
// real AuthKit JWTs directly from WorkOS:
//   1. requestDeviceCode()      → device_code + user_code + verification URL
//   2. pollForToken(deviceCode) → poll until the user approves in the browser
//   3. refreshAccessToken(rt)   → mint a new 5-minute access token on demand
//
// Endpoints & payloads follow the confirmed Stage-2 contract. The public
// CLIENT_ID is injected at build time (see utils/config.ts). No `zod` here —
// the extension bundles no validation library, so responses are validated by
// hand.

import { getWorkosClientId } from "../utils/config";

const WORKOS_BASE = "https://api.workos.com";
const DEVICE_AUTHORIZE_URL = `${WORKOS_BASE}/user_management/authorize/device`;
const AUTHENTICATE_URL = `${WORKOS_BASE}/user_management/authenticate`;

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

// ── Response shapes ──────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface WorkosUser {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user?: WorkosUser;
  organization_id?: string | null;
}

export interface RefreshResponse {
  access_token: string;
  // WorkOS MAY rotate the refresh token — persist whichever it returns.
  refresh_token: string;
}

// ── Errors ───────────────────────────────────────────────────────────────────

/** Thrown for unrecoverable device-flow failures (denied/expired/network). */
export class WorkosAuthError extends Error {
  constructor(
    message: string,
    public code:
      | "access_denied"
      | "expired_token"
      | "network"
      | "invalid_response"
      | "not_configured"
  ) {
    super(message);
    this.name = "WorkosAuthError";
  }
}

function assertConfigured(): void {
  if (!getWorkosClientId()) {
    throw new WorkosAuthError(
      "This extension build has no WorkOS client id embedded. Rebuild with WORKOS_CLIENT_ID set.",
      "not_configured"
    );
  }
}

async function postForm(
  url: string,
  form: Record<string, string>
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ── Validation helpers (hand-rolled — no zod in the extension bundle) ─────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function parseDeviceCode(body: unknown): DeviceCodeResponse | null {
  if (!isRecord(body)) return null;
  const device_code = str(body.device_code);
  const user_code = str(body.user_code);
  const verification_uri = str(body.verification_uri);
  const verification_uri_complete = str(body.verification_uri_complete);
  if (
    !device_code ||
    !user_code ||
    !verification_uri ||
    !verification_uri_complete
  ) {
    return null;
  }
  return {
    device_code,
    user_code,
    verification_uri,
    verification_uri_complete,
    expires_in: typeof body.expires_in === "number" ? body.expires_in : 300,
    interval: typeof body.interval === "number" ? body.interval : 5,
  };
}

function parseUser(body: unknown): WorkosUser | undefined {
  if (!isRecord(body)) return undefined;
  const id = str(body.id);
  const email = str(body.email);
  if (!id || !email) return undefined;
  return {
    id,
    email,
    first_name: str(body.first_name) ?? null,
    last_name: str(body.last_name) ?? null,
  };
}

function parseToken(body: unknown): TokenResponse | null {
  if (!isRecord(body)) return null;
  const access_token = str(body.access_token);
  const refresh_token = str(body.refresh_token);
  if (!access_token || !refresh_token) return null;
  return {
    access_token,
    refresh_token,
    user: parseUser(body.user),
    organization_id: str(body.organization_id) ?? null,
  };
}

function parseRefresh(body: unknown): RefreshResponse | null {
  if (!isRecord(body)) return null;
  const access_token = str(body.access_token);
  const refresh_token = str(body.refresh_token);
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// ── Device flow ────────────────────────────────────────────────────────────

/** Step 1: request a device + user code from WorkOS. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  assertConfigured();
  let result: { status: number; body: unknown };
  try {
    result = await postForm(DEVICE_AUTHORIZE_URL, {
      client_id: getWorkosClientId(),
    });
  } catch (err) {
    throw new WorkosAuthError(
      `Could not reach WorkOS to start authentication: ${(err as Error).message}`,
      "network"
    );
  }

  if (result.status >= 400) {
    const message = extractErrorMessage(result.body);
    throw new WorkosAuthError(
      `WorkOS rejected the device-code request${message ? `: ${message}` : ""}.`,
      "invalid_response"
    );
  }

  const parsed = parseDeviceCode(result.body);
  if (!parsed) {
    throw new WorkosAuthError(
      "WorkOS returned an unexpected device-code response.",
      "invalid_response"
    );
  }
  return parsed;
}

/** Discriminated outcome of a SINGLE poll attempt. */
export type PollResult =
  | { status: "complete"; token: TokenResponse }
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "network" };

/**
 * Step 2 (single attempt): poll the token endpoint once.
 *
 * Callers own the polling loop and the interval; this maps WorkOS's response
 * into a discriminated result:
 *   - 200                       → complete (tokens issued)
 *   - authorization_pending     → pending (keep polling)
 *   - slow_down                 → slow_down (increase interval, keep polling)
 *   - access_denied             → denied (stop)
 *   - expired_token             → expired (stop)
 *   - network / other           → network (transient; caller may retry)
 */
export async function pollForToken(deviceCode: string): Promise<PollResult> {
  assertConfigured();
  let result: { status: number; body: unknown };
  try {
    result = await postForm(AUTHENTICATE_URL, {
      client_id: getWorkosClientId(),
      grant_type: DEVICE_CODE_GRANT,
      device_code: deviceCode,
    });
  } catch {
    return { status: "network" };
  }

  if (result.status === 200) {
    const parsed = parseToken(result.body);
    if (!parsed) {
      throw new WorkosAuthError(
        "WorkOS returned an unexpected token response.",
        "invalid_response"
      );
    }
    return { status: "complete", token: parsed };
  }

  const errorCode = extractOauthError(result.body);
  switch (errorCode) {
    case "authorization_pending":
      return { status: "pending" };
    case "slow_down":
      return { status: "slow_down" };
    case "access_denied":
      return { status: "denied" };
    case "expired_token":
      return { status: "expired" };
    default:
      // An unrecognized 4xx/5xx — treat as transient so a hiccup doesn't abort
      // an otherwise-live device flow.
      return { status: "network" };
  }
}

/** Step 3: exchange a refresh token for a fresh access token (may rotate rt). */
export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshResponse> {
  assertConfigured();
  let result: { status: number; body: unknown };
  try {
    result = await postForm(AUTHENTICATE_URL, {
      client_id: getWorkosClientId(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  } catch (err) {
    throw new WorkosAuthError(
      `Could not reach WorkOS to refresh the session: ${(err as Error).message}`,
      "network"
    );
  }

  if (result.status >= 400) {
    const message =
      extractOauthError(result.body) ?? extractErrorMessage(result.body);
    // Distinguish a genuinely dead session from a transient hiccup:
    //   - 5xx / 429           → server unavailable or rate-limited; the refresh
    //                           token is probably still valid. Surface as
    //                           `network` so the caller KEEPS the creds and the
    //                           user can retry (no wrongful forced re-login).
    //   - other 4xx (400/401) → the refresh grant was rejected (revoked/expired
    //                           token) → access_denied so the caller clears creds.
    const transient = result.status >= 500 || result.status === 429;
    throw new WorkosAuthError(
      `Session refresh failed${message ? `: ${message}` : ""}.`,
      transient ? "network" : "access_denied"
    );
  }

  const parsed = parseRefresh(result.body);
  if (!parsed) {
    throw new WorkosAuthError(
      "WorkOS returned an unexpected refresh response.",
      "invalid_response"
    );
  }
  return parsed;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractOauthError(body: unknown): string | null {
  if (isRecord(body) && "error" in body) {
    const e = (body as { error: unknown }).error;
    return typeof e === "string" ? e : null;
  }
  return null;
}

function extractErrorMessage(body: unknown): string | null {
  if (isRecord(body)) {
    const msg = body.error_description ?? body.message ?? body.error;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}
