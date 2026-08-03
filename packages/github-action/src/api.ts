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

  constructor(message: string, status: number) {
    super(message);
    this.name = "EnvpilotApiError";
    this.status = status;
  }
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
  /** base64 of the decrypted bytes. */
  content: string;
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
  const url = new URL("/api/v1/files", params.apiUrl);
  url.searchParams.set("environment", params.environment);
  url.searchParams.set("project", params.project);
  // Identify the surface so a github_action-scoped key authorizes here.
  url.searchParams.set("surface", "github_action");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new EnvpilotApiError(await errorMessage(response), response.status);
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
  const url = new URL("/api/v1/secrets", params.apiUrl);
  url.searchParams.set("environment", params.environment);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new EnvpilotApiError(await errorMessage(response), response.status);
  }

  return (await response.json()) as EnvpilotSecretsResponse;
}
