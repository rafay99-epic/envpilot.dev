import { getWorkosClientId } from "../utils/config";

const WORKOS_BASE = "https://api.workos.com";
const DEVICE_AUTHORIZE_URL = `${WORKOS_BASE}/user_management/authorize/device`;
const AUTHENTICATE_URL = `${WORKOS_BASE}/user_management/authenticate`;

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

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
  refresh_token: string;
}

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
    signal: AbortSignal.timeout(10_000),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

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

export type PollResult =
  | { status: "complete"; token: TokenResponse }
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "denied" }
  | { status: "expired" }
  | { status: "network" }
  | { status: "error" };

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
    return parsed ? { status: "complete", token: parsed } : { status: "error" };
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
      return { status: "network" };
  }
}

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
