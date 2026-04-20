import * as core from "@actions/core";
import { exchangeToken } from "./auth.js";
import { fetchSecrets, maskAndExport, reportResults } from "./secrets.js";
import type { ActionInputs, AuthMethod, ExportTarget } from "./types.js";
import { EnvpilotApiError, STATE_KEYS } from "./types.js";

// ─── Input Parsing ───────────────────────────────────────────────────────────

function parseInputs(): ActionInputs {
  const method = core.getInput("method", { required: true }) as AuthMethod;
  const serviceToken = core.getInput("service-token");
  const projectId = core.getInput("project-id", { required: true });
  const environment = core.getInput("environment", { required: true });
  const apiUrl = core.getInput("api-url").replace(/\/+$/, ""); // Strip trailing slashes
  const exportTo = (core.getInput("export-to") || "env") as ExportTarget;
  const maskValues = core.getInput("mask-values") !== "false";
  const keysRaw = core.getInput("keys");
  const keys = keysRaw
    ? keysRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  return {
    method,
    serviceToken,
    projectId,
    environment,
    apiUrl,
    exportTo,
    maskValues,
    keys,
  };
}

function validateInputs(inputs: ActionInputs): void {
  if (!["service-token", "oidc"].includes(inputs.method)) {
    throw new Error(
      `Invalid method '${inputs.method}'. Must be 'service-token' or 'oidc'.`
    );
  }

  if (inputs.method === "service-token" && !inputs.serviceToken) {
    throw new Error(
      "The 'service-token' input is required when method is 'service-token'. " +
        "Set it from a GitHub Secret: service-token: ${{ secrets.ENVPILOT_SERVICE_TOKEN }}"
    );
  }

  if (!inputs.projectId) {
    throw new Error("The 'project-id' input is required.");
  }

  if (!inputs.environment) {
    throw new Error("The 'environment' input is required.");
  }

  if (!["env", "outputs", "both"].includes(inputs.exportTo)) {
    throw new Error(
      `Invalid export-to '${inputs.exportTo}'. Must be 'env', 'outputs', or 'both'.`
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  try {
    core.info("Envpilot — Pulling secrets into workflow...");
    core.info("");

    // 1. Parse and validate inputs
    const inputs = parseInputs();
    validateInputs(inputs);

    core.info(`  Project:       ${inputs.projectId}`);
    core.info(`  Environment:   ${inputs.environment}`);
    core.info(`  Auth method:   ${inputs.method}`);
    core.info(`  Export target:  ${inputs.exportTo}`);
    if (inputs.keys.length > 0) {
      core.info(`  Filter keys:   ${inputs.keys.join(", ")}`);
    }
    core.info("");

    // 2. Exchange credentials for a short-lived session token
    core.info("Authenticating...");
    const session = await exchangeToken(
      inputs.apiUrl,
      inputs.method,
      inputs.serviceToken,
      inputs.projectId,
      inputs.environment
    );

    // Mask the session token so it never leaks in logs
    core.setSecret(session.sessionToken);

    // Save session state for the post-job cleanup step
    core.saveState(STATE_KEYS.SESSION_ID, session.sessionId);
    core.saveState(STATE_KEYS.SESSION_TOKEN, session.sessionToken);
    core.saveState(STATE_KEYS.API_URL, inputs.apiUrl);

    core.info("Authenticated successfully");
    core.info("");

    // 3. Fetch secrets
    core.info("Fetching secrets...");
    const result = await fetchSecrets(
      inputs.apiUrl,
      session.sessionToken,
      inputs.projectId,
      inputs.environment,
      inputs.keys
    );

    if (result.variables.length === 0) {
      core.warning(
        "No variables found for the specified project and environment. " +
          "Verify that the project ID, environment name, and token scope are correct."
      );
    }

    // 4. Mask and export
    const exportedCount = maskAndExport(
      result.variables,
      inputs.exportTo,
      inputs.maskValues
    );

    // Save the count for post-job session completion
    core.saveState(STATE_KEYS.VARIABLES_ACCESSED, String(exportedCount));

    // 5. Set outputs
    core.setOutput("session-id", session.sessionId);
    core.setOutput("variables-count", String(exportedCount));

    // 6. Report
    reportResults(result.variables, result.decryptionFailures, inputs.exportTo);

    core.info(`Done — ${exportedCount} variable(s) exported.`);
  } catch (error) {
    if (error instanceof EnvpilotApiError) {
      core.error(`Envpilot API error (${error.statusCode}): ${error.message}`);
      if (error.errorCode) {
        core.error(`Error code: ${error.errorCode}`);
      }

      // Provide actionable hints for common errors
      if (error.statusCode === 401) {
        core.error(
          "Hint: Your service token may be invalid or expired. " +
            "Check that the token in your GitHub Secret matches an active token in Envpilot."
        );
      } else if (error.statusCode === 403) {
        core.error(
          "Hint: Your token may not have access to this project or environment. " +
            "Check the token's scope in Envpilot project settings."
        );
      } else if (error.statusCode === 404) {
        core.error(
          "Hint: The project or environment was not found. " +
            "Verify the project-id and environment inputs."
        );
      } else if (error.statusCode === 429) {
        core.error(
          "Hint: Rate limit exceeded. Wait a moment and re-run the workflow."
        );
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

run();
