import * as core from "@actions/core";
import { safeReadBody } from "./http.js";
import type { AuthMethod, ExchangeRequest, ExchangeResponse } from "./types.js";
import { EnvpilotApiError } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const OIDC_AUDIENCE = "envpilot.dev";
const EXCHANGE_ENDPOINT = "/api/v1/cicd/exchange";
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// ─── OIDC Token Retrieval ────────────────────────────────────────────────────

/**
 * Request a GitHub OIDC token for the Envpilot audience.
 * Requires `permissions: { id-token: write }` in the workflow.
 */
async function getOIDCToken(): Promise<string> {
  try {
    const token = await core.getIDToken(OIDC_AUDIENCE);
    if (!token) {
      throw new Error("OIDC token was empty");
    }
    return token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to obtain GitHub OIDC token. Ensure your workflow has ` +
        `\`permissions: { id-token: write }\` set. Details: ${message}`
    );
  }
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

/**
 * Exchange a service token or OIDC JWT for a short-lived Envpilot session token.
 *
 * The session token is used to fetch secrets and is automatically revoked
 * in the post-job cleanup step.
 */
export async function exchangeToken(
  apiUrl: string,
  method: AuthMethod,
  serviceToken: string,
  projectId: string,
  environment: string
): Promise<ExchangeResponse> {
  const body: ExchangeRequest = {
    method,
    projectId,
    environments: [environment],
    githubRepository: process.env.GITHUB_REPOSITORY,
    githubWorkflow: process.env.GITHUB_WORKFLOW,
    githubRunId: process.env.GITHUB_RUN_ID,
    githubActor: process.env.GITHUB_ACTOR,
    githubRef: process.env.GITHUB_REF,
  };

  // Attach the appropriate credential
  if (method === "service-token") {
    if (!serviceToken) {
      throw new Error(
        "service-token input is required when method is 'service-token'"
      );
    }
    body.serviceToken = serviceToken;
  } else if (method === "oidc") {
    core.info("Requesting GitHub OIDC token...");
    body.oidcToken = await getOIDCToken();
    core.info("OIDC token obtained successfully");
  } else {
    throw new Error(
      `Invalid authentication method '${method}'. Use 'service-token' or 'oidc'.`
    );
  }

  const url = `${apiUrl}${EXCHANGE_ENDPOINT}`;
  core.debug(`Exchanging credentials at ${url}`);

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await safeReadBody(response);
    throw new EnvpilotApiError(
      `Token exchange failed: ${errorBody.error || response.statusText}`,
      response.status,
      errorBody.code
    );
  }

  const data = (await response.json()) as ExchangeResponse;

  if (!data.sessionToken || !data.sessionId) {
    throw new Error(
      "Invalid exchange response: missing sessionToken or sessionId"
    );
  }

  core.debug(
    `Session created: ${data.sessionId} (expires: ${new Date(data.expiresAt).toISOString()})`
  );
  return data;
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });

      // Don't retry client errors (4xx) — only server errors (5xx) and network failures
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        core.warning(
          `Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`
        );
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        const message = error instanceof Error ? error.message : String(error);
        core.warning(
          `Request failed: ${message}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error("Exhausted retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
