/**
 * Thin client for `GET /api/v1/secrets` on the Envpilot platform. See
 * apps/web/src/app/api/v1/secrets/route.ts (monorepo) for the server side —
 * this action only talks to the deployed API, never the monorepo directly.
 */

export interface EnvpilotVariable {
  key: string;
  value: string;
}

export interface EnvpilotSecretsResponse {
  project: { name: string; slug: string };
  environment: string;
  variables: EnvpilotVariable[];
}

export interface PullSecretsParams {
  apiUrl: string;
  token: string;
  environment: string;
}

/** Thrown on any non-200 response. `message` is the server's `{error}` body
 * (or a generic fallback if the body isn't JSON) — safe to surface as-is,
 * it never includes the token. */
export class EnvpilotApiError extends Error {
  readonly status: number;
  /** Server's Retry-After, in seconds, when it sent one (429 responses). */
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "EnvpilotApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Parse Retry-After (seconds form). Undefined when absent or unparseable. */
function retryAfterOf(response: Response): number | undefined {
  const raw = response.headers.get("retry-after")?.trim();
  // Empty after trimming must fall through to the caller's default, NOT to
  // zero: Number("") is 0, which reads as "retry immediately" and turns a
  // malformed header into a hot retry loop against a limiter.
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** One secret file as returned by `GET /api/v1/files`. */
export interface EnvpilotFile {
  name: string;
  /** Destination path relative to the workspace, e.g. android/app/upload.jks */
  path: string;
  /** POSIX mode to apply: "0600" or "0400". */
  mode: string;
  size: number;
  sha256: string;
  contentType?: string;
  environments: string[];
  updatedAt: number;
  /** base64 of the decrypted bytes. Absent in metadata-only responses. */
  content?: string;
}

export interface EnvpilotFilesResponse {
  project: { slug: string };
  environment: string;
  files: EnvpilotFile[];
}

export interface PullFilesParams {
  apiUrl: string;
  token: string;
  environment: string;
  /** Project slug — the files endpoint is project-scoped. */
  project: string;
  /** Metadata only: path/size/checksum, nothing decrypted. */
  metadataOnly?: boolean;
  /** Restrict the pull to these recorded paths. Omit for all of them. */
  paths?: string[];
}

/**
 * Per-request ceiling.
 *
 * `fetch` has no default timeout, so a stalled TLS handshake or a response
 * body that never finishes blocked until the job's own 360-minute limit,
 * burning a runner with nothing in the log to explain it.
 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Resolve the API base and refuse a plaintext scheme.
 *
 * The token rides in an `Authorization` header on every call, so an `http://`
 * base URL puts a key that can read the whole project on the wire in clear.
 * Loopback is allowed because that is how the local dev server is exercised.
 */
function baseUrl(apiUrl: string): URL {
  const base = new URL(apiUrl);
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (base.protocol !== "https:" && !loopback.includes(base.hostname)) {
    throw new Error(
      `refusing to send the API key over ${base.protocol}// — set api-url to an https endpoint (got ${base.origin})`
    );
  }
  return base;
}

/**
 * Fetch a project's secret files.
 *
 * The API key must carry the `files` resource, which Envpilot never grants
 * by default — so a token minted for variables alone cannot reach signing
 * material even if this input is enabled.
 */
export async function pullFiles(
  params: PullFilesParams
): Promise<EnvpilotFilesResponse> {
  const url = new URL("/api/v1/files", baseUrl(params.apiUrl));
  url.searchParams.set("environment", params.environment);
  url.searchParams.set("project", params.project);
  // Identify the surface so a github_action-scoped key authorizes here.
  url.searchParams.set("surface", "github_action");
  if (params.metadataOnly) url.searchParams.set("metadataOnly", "1");
  for (const path of params.paths ?? []) url.searchParams.append("path", path);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new EnvpilotApiError(
      await errorMessage(response),
      response.status,
      retryAfterOf(response)
    );
  }

  return (await response.json()) as EnvpilotFilesResponse;
}

/** Server's `{error}` body, or a generic fallback. Never includes the token. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string" &&
      (body as { error: string }).error.length > 0
    ) {
      return (body as { error: string }).error;
    }
  } catch {
    // Non-JSON error body — fall back to the generic status message.
  }
  return `Request failed with status ${response.status}`;
}

export async function pullSecrets(
  params: PullSecretsParams
): Promise<EnvpilotSecretsResponse> {
  const url = new URL("/api/v1/secrets", baseUrl(params.apiUrl));
  url.searchParams.set("environment", params.environment);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new EnvpilotApiError(
      await errorMessage(response),
      response.status,
      retryAfterOf(response)
    );
  }

  return (await response.json()) as EnvpilotSecretsResponse;
}
