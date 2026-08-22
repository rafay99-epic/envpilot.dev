// WorkOS AuthKit device authorization flow, over raw HTTP (no SDK).
//
// This replaces the old homegrown device-code + cliTokens login. The CLI now
// obtains real AuthKit JWTs directly from WorkOS:
//   1. requestDeviceCode()      → device_code + user_code + verification URL
//   2. pollForToken(deviceCode) → poll until the user approves in the browser
//   3. refreshAccessToken(rt)   → mint a new 5-minute access token on demand
//
// Endpoints & payloads follow the confirmed Stage-2 contract. The public
// CLIENT_ID is injected at build time (see env.ts).

import { z } from "zod";
import { WORKOS_CLIENT_ID } from "./env.js";

const WORKOS_BASE = "https://api.workos.com";
const DEVICE_AUTHORIZE_URL = `${WORKOS_BASE}/user_management/authorize/device`;
const AUTHENTICATE_URL = `${WORKOS_BASE}/user_management/authenticate`;

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const REFRESH_ATTEMPTS = 3;
const REFRESH_TIMEOUT_MS = 3_000;
const REFRESH_RETRY_BASE_MS = 150;

function refreshRetryDelay(attempt: number): number {
  const ceiling = REFRESH_RETRY_BASE_MS * 2 ** attempt;
  return ceiling / 2 + Math.random() * (ceiling / 2);
}

// ── Response schemas ─────────────────────────────────────────────────────────

const deviceCodeSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  verification_uri_complete: z.string(),
  expires_in: z.number().default(300),
  interval: z.number().default(5),
});
export type DeviceCodeResponse = z.infer<typeof deviceCodeSchema>;

const workosUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
});
export type WorkosUser = z.infer<typeof workosUserSchema>;

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: workosUserSchema.optional(),
  organization_id: z.string().nullish(),
});
export type TokenResponse = z.infer<typeof tokenSchema>;

const refreshSchema = z.object({
  access_token: z.string(),
  // WorkOS MAY rotate the refresh token — persist whichever it returns.
  refresh_token: z.string(),
});
export type RefreshResponse = z.infer<typeof refreshSchema>;

export type RefreshTransientCause =
  | "timeout"
  | "network"
  | "rate_limited"
  | "upstream"
  | "invalid_response"
  | "unexpected";

export type RefreshOutcome =
  | {
      kind: "success";
      accessToken: string;
      refreshToken: string;
    }
  | {
      kind: "transient";
      cause: RefreshTransientCause;
      message: string;
    }
  | {
      kind: "terminal";
      cause: "invalid_grant";
      message: string;
    };

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
  if (!WORKOS_CLIENT_ID) {
    throw new WorkosAuthError(
      "This CLI build has no WorkOS client id embedded. Rebuild with WORKOS_CLIENT_ID set.",
      "not_configured"
    );
  }
}

async function postForm(
  url: string,
  form: Record<string, string>,
  signal?: AbortSignal
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ── Device flow ────────────────────────────────────────────────────────────

/** Step 1: request a device + user code from WorkOS. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  assertConfigured();
  let result: { status: number; body: unknown };
  try {
    result = await postForm(DEVICE_AUTHORIZE_URL, {
      client_id: WORKOS_CLIENT_ID,
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

  const parsed = deviceCodeSchema.safeParse(result.body);
  if (!parsed.success) {
    throw new WorkosAuthError(
      "WorkOS returned an unexpected device-code response.",
      "invalid_response"
    );
  }
  return parsed.data;
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
      client_id: WORKOS_CLIENT_ID,
      grant_type: DEVICE_CODE_GRANT,
      device_code: deviceCode,
    });
  } catch {
    return { status: "network" };
  }

  if (result.status === 200) {
    const parsed = tokenSchema.safeParse(result.body);
    if (!parsed.success) {
      throw new WorkosAuthError(
        "WorkOS returned an unexpected token response.",
        "invalid_response"
      );
    }
    return { status: "complete", token: parsed.data };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function refreshErrorMessage(body: unknown): string {
  const message = extractErrorMessage(body);
  return message
    ? `Session refresh failed: ${message.replace(/\.$/, "")}.`
    : "Session refresh failed.";
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function transientCause(status: number): RefreshTransientCause | null {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if ([500, 502, 503, 504].includes(status)) return "upstream";
  return null;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<RefreshOutcome> {
  assertConfigured();
  for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
    let result: { status: number; body: unknown };
    try {
      result = await postForm(
        AUTHENTICATE_URL,
        {
          client_id: WORKOS_CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        },
        AbortSignal.timeout(REFRESH_TIMEOUT_MS)
      );
    } catch (error) {
      if (attempt < REFRESH_ATTEMPTS - 1) {
        await sleep(refreshRetryDelay(attempt));
        continue;
      }
      return {
        kind: "transient",
        cause: isTimeoutError(error) ? "timeout" : "network",
        message: isTimeoutError(error)
          ? "Session refresh timed out. Try again."
          : "Could not reach WorkOS to refresh the session. Try again.",
      };
    }

    if (result.status === 200) {
      const parsed = refreshSchema.safeParse(result.body);
      if (!parsed.success) {
        return {
          kind: "transient",
          cause: "invalid_response",
          message: "WorkOS returned an unexpected refresh response. Try again.",
        };
      }
      return {
        kind: "success",
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
      };
    }

    if (
      result.status === 400 &&
      extractOauthError(result.body) === "invalid_grant"
    ) {
      return {
        kind: "terminal",
        cause: "invalid_grant",
        message: refreshErrorMessage(result.body),
      };
    }

    const cause = transientCause(result.status);
    if (cause && attempt < REFRESH_ATTEMPTS - 1) {
      await sleep(refreshRetryDelay(attempt));
      continue;
    }
    if (cause) {
      return {
        kind: "transient",
        cause,
        message: `${refreshErrorMessage(result.body)} Try again.`,
      };
    }

    return {
      kind: "transient",
      cause: "unexpected",
      message: `${refreshErrorMessage(result.body)} Try again.`,
    };
  }

  return {
    kind: "transient",
    cause: "unexpected",
    message: "Session refresh failed. Try again.",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractOauthError(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    return typeof e === "string" ? e : null;
  }
  return null;
}

function extractErrorMessage(body: unknown): string | null {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const msg = obj.error_description ?? obj.message ?? obj.error;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}
