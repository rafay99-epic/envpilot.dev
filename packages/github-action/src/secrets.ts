import * as core from "@actions/core";
import { safeReadBody } from "./http.js";
import type { ExportTarget, SecretEntry, SecretsResponse } from "./types.js";
import { EnvpilotApiError } from "./types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const SECRETS_ENDPOINT = "/api/v1/cicd/secrets";
const REQUEST_TIMEOUT_MS = 60_000;

// ─── Fetch Secrets ───────────────────────────────────────────────────────────

/**
 * Fetch decrypted secrets from the Envpilot API using the session token.
 *
 * The API returns all variables for the project + environment scope that the
 * session was created for. Values are decrypted server-side via WorkOS Vault.
 */
export async function fetchSecrets(
  apiUrl: string,
  sessionToken: string,
  projectId: string,
  environment: string,
  filterKeys: string[]
): Promise<SecretsResponse> {
  const url = new URL(`${apiUrl}${SECRETS_ENDPOINT}`);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("environment", environment);

  // If specific keys are requested, send them as a query parameter
  if (filterKeys.length > 0) {
    url.searchParams.set("keys", filterKeys.join(","));
  }

  core.debug(`Fetching secrets from ${url.pathname}${url.search}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await safeReadBody(response);
    throw new EnvpilotApiError(
      `Failed to fetch secrets: ${errorBody.error || response.statusText}`,
      response.status,
      errorBody.code
    );
  }

  const data = (await response.json()) as SecretsResponse;

  if (!data.variables || !Array.isArray(data.variables)) {
    throw new Error("Invalid secrets response: missing variables array");
  }

  return data;
}

// ─── Mask & Export ───────────────────────────────────────────────────────────

/**
 * Mask secret values and export them as environment variables and/or step outputs.
 *
 * - `core.setSecret()` registers a value to be masked in ALL subsequent log output.
 * - `core.exportVariable()` makes the variable available to all subsequent steps.
 * - `core.setOutput()` makes the value available as a step output.
 *
 * @returns The number of variables successfully exported.
 */
export function maskAndExport(
  variables: SecretEntry[],
  exportTo: ExportTarget,
  maskValues: boolean
): number {
  let exported = 0;

  for (const variable of variables) {
    const { key, value } = variable;

    // Mask the value in logs — do this BEFORE any logging that might contain it
    if (maskValues && value) {
      core.setSecret(value);
    }

    // Export as environment variable
    if (exportTo === "env" || exportTo === "both") {
      core.exportVariable(key, value);
    }

    // Export as step output
    if (exportTo === "outputs" || exportTo === "both") {
      core.setOutput(key, value);
    }

    core.debug(`Exported: ${key} (${variable.environment})`);
    exported++;
  }

  return exported;
}

// ─── Report ──────────────────────────────────────────────────────────────────

/**
 * Log a summary of the secrets fetch operation.
 */
export function reportResults(
  variables: SecretEntry[],
  decryptionFailures: string[],
  exportTo: ExportTarget
): void {
  // Summary table
  core.info("");
  core.info(`  Variables pulled:  ${variables.length}`);
  core.info(`  Export target:     ${exportTo}`);
  if (decryptionFailures.length > 0) {
    core.warning(
      `  Decryption failures: ${decryptionFailures.length} (${decryptionFailures.join(", ")})`
    );
  }
  core.info("");

  // List variable keys (never values) for debugging
  if (variables.length > 0) {
    const keys = variables.map((v) => v.key);
    core.info(`  Keys: ${keys.join(", ")}`);
  }
}
