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
    let message = `Request failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string" &&
        (body as { error: string }).error.length > 0
      ) {
        message = (body as { error: string }).error;
      }
    } catch {
      // Non-JSON error body — fall back to the generic status message.
    }
    throw new EnvpilotApiError(message, response.status);
  }

  return (await response.json()) as EnvpilotSecretsResponse;
}
