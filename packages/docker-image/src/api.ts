import type { ResolvedConfig } from "./config.js";

/**
 * Client for the two public REST endpoints this image reads. Both authorize
 * through `_authorizeRequest` on the server, which defaults an omitted
 * `surface` to `rest_api` — so a plain API key works here with no
 * Action-specific query parameter.
 */

export interface EnvpilotVariable {
  key: string;
  value: string;
}

/** One secret file. `content` is base64 and absent in metadata-only replies. */
export interface EnvpilotFile {
  name: string;
  /** Destination path relative to the output directory, e.g. app/upload.jks */
  path: string;
  /** POSIX mode to apply: "0600" or "0400". */
  mode: string;
  size: number;
  sha256: string;
  content?: string;
}

/**
 * Any non-2xx response. `message` is the server's `{error}` body when it sent
 * one, which is safe to print as-is — the API never echoes the credential.
 */
export class EnvpilotApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "EnvpilotApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Parse Retry-After (seconds form). Undefined when absent or unparseable.
 *
 * An empty header must NOT fall through to zero: `Number("")` is 0, which
 * reads as "retry immediately" and turns a malformed header into a hot loop
 * against the limiter.
 */
function retryAfterOf(response: Response): number | undefined {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function errorFor(response: Response): Promise<EnvpilotApiError> {
  let message = `Request failed with status ${response.status}`;
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      message = body.error;
    }
  } catch {
    // Non-JSON body (a proxy error page, usually). The status is the signal.
  }
  return new EnvpilotApiError(message, response.status, retryAfterOf(response));
}

async function get(config: ResolvedConfig, path: string): Promise<Response> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: "application/json",
    },
  });
  if (!response.ok) throw await errorFor(response);
  return response;
}

/** Fetch every variable for the configured project and environment. */
export async function fetchVariables(
  config: ResolvedConfig
): Promise<EnvpilotVariable[]> {
  const response = await get(
    config,
    `/api/v1/projects/${encodeURIComponent(config.project)}/variables` +
      `?environment=${encodeURIComponent(config.environment)}`
  );
  const body = (await response.json()) as {
    variables?: { key: string; value?: string }[];
  };

  // A row without a value means the server declined to decrypt it. Writing
  // an empty string there would silently hand the app a blank credential,
  // so refuse the whole pull instead.
  const missing = (body.variables ?? []).filter((v) => v.value === undefined);
  if (missing.length > 0) {
    throw new EnvpilotApiError(
      `Refusing a partial pull — ${missing.length} variable(s) came back without a value.`,
      502
    );
  }

  return (body.variables ?? []).map((v) => ({ key: v.key, value: v.value! }));
}

/**
 * Fetch secret files. With `paths` omitted the reply is metadata only — path,
 * size and checksum, nothing decrypted — which is what makes batching
 * possible, since the caller otherwise has no way to know the sizes.
 */
export async function fetchFiles(
  config: ResolvedConfig,
  paths?: string[]
): Promise<EnvpilotFile[]> {
  const query = new URLSearchParams({
    project: config.project,
    environment: config.environment,
  });
  if (paths === undefined) {
    query.set("metadataOnly", "1");
  } else {
    for (const path of paths) query.append("path", path);
  }

  const response = await get(config, `/api/v1/files?${query.toString()}`);
  const body = (await response.json()) as { files?: EnvpilotFile[] };
  return body.files ?? [];
}
