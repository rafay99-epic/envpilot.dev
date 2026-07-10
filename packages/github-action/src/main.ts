import { chmodSync, writeFileSync } from "node:fs";
import * as core from "@actions/core";
import { buildDotenvContent } from "./dotenv.js";
import { EnvpilotApiError, pullSecrets } from "./api.js";

function parseBooleanInput(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return fallback;
  return normalized === "true";
}

export async function run(): Promise<void> {
  try {
    const token = core.getInput("token", { required: true });
    const environment = core.getInput("environment", { required: true });
    const apiUrl = core.getInput("api-url") || "https://www.envpilot.dev";
    const exportEnv = parseBooleanInput(core.getInput("export-env"), true);
    const envFile = core.getInput("env-file");

    let result;
    try {
      result = await pullSecrets({ apiUrl, token, environment });
    } catch (error) {
      const message =
        error instanceof EnvpilotApiError || error instanceof Error
          ? error.message
          : "Unknown error while contacting Envpilot";
      core.setFailed(`Envpilot: ${message}`);
      return;
    }

    const variables = result.variables;

    // CRITICAL ORDER: mask every value before anything that could export or
    // log it, so it is redacted in logs even if a later workflow step echoes
    // it. Skip empty values — core.setSecret("") would mask every subsequent
    // log line for the rest of the job.
    for (const variable of variables) {
      if (variable.value !== "") {
        core.setSecret(variable.value);
      }
    }

    if (exportEnv) {
      for (const variable of variables) {
        core.exportVariable(variable.key, variable.value);
      }
    }

    if (envFile) {
      const content = buildDotenvContent(variables);
      writeFileSync(envFile, content, { mode: 0o600 });
      // writeFileSync only applies `mode` when creating a new file; chmod
      // explicitly so an existing file at this path also ends up 0600.
      chmodSync(envFile, 0o600);
    }

    core.info(
      `Envpilot: pulled ${variables.length} variables from ${result.project.name} (${result.environment})`
    );
    core.setOutput("count", variables.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setFailed(`Envpilot: ${message}`);
  }
}
