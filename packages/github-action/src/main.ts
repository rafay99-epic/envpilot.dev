import { chmodSync, writeFileSync } from "node:fs";
import * as core from "@actions/core";
import { buildDotenvContent } from "./dotenv.js";
import { EnvpilotApiError, pullSecrets } from "./api.js";
import { pullArtifacts } from "./api.js";
import { downloadArtifact } from "./artifacts.js";

function parseBooleanInput(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return fallback;
  return normalized === "true";
}

export async function run(): Promise<void> {
  try {
    const token = core.getInput("token", { required: true });
    const pullVariablesEnabled = parseBooleanInput(
      core.getInput("pull-variables"),
      true
    );
    const environment = core.getInput("environment", {
      required: pullVariablesEnabled,
    });
    const apiUrl = core.getInput("api-url") || "https://www.envpilot.dev";
    const exportEnv = parseBooleanInput(core.getInput("export-env"), true);
    const envFile = core.getInput("env-file");
    const artifactInput = core.getInput("artifacts").trim();
    const artifactDir = core.getInput("artifact-dir") || ".envpilot-artifacts";

    if (!pullVariablesEnabled && !artifactInput) {
      throw new Error(
        'Nothing to pull: enable "pull-variables" or provide "artifacts"'
      );
    }

    if (pullVariablesEnabled) {
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
        chmodSync(envFile, 0o600);
      }

      core.info(
        `Envpilot: pulled ${variables.length} variables from ${result.project.name} (${result.environment})`
      );
      core.setOutput("count", variables.length);
    } else {
      core.setOutput("count", 0);
    }
    if (artifactInput) {
      const names =
        artifactInput === "*"
          ? undefined
          : artifactInput
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean);
      const artifactResult = await pullArtifacts({ apiUrl, token, names });
      for (const artifact of artifactResult.artifacts) {
        await downloadArtifact(artifact, artifactDir);
      }
      core.info(
        `Envpilot: pulled ${artifactResult.artifacts.length} secure artifact${artifactResult.artifacts.length === 1 ? "" : "s"} from ${artifactResult.project.name}`
      );
      core.setOutput("artifact-count", artifactResult.artifacts.length);
    } else {
      core.setOutput("artifact-count", 0);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setFailed(`Envpilot: ${message}`);
  }
}
