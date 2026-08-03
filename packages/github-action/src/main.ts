import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import * as core from "@actions/core";
import { buildDotenvContent } from "./dotenv.js";
import {
  EnvpilotApiError,
  pullFiles,
  pullSecrets,
  type EnvpilotFile,
} from "./api.js";

function parseBooleanInput(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return fallback;
  return normalized === "true";
}

/**
 * Write one secret file to its recorded path.
 *
 * The path comes from the server and the server validates it, but this is
 * the process that creates files on the runner — it re-checks containment
 * itself. A server bug or a tampered response must not be able to write
 * outside the workspace.
 */
function writeSecretFile(root: string, file: EnvpilotFile): void {
  if (isAbsolute(file.path)) {
    throw new Error("refusing an absolute path");
  }
  const absoluteRoot = resolve(root);
  const destination = resolve(absoluteRoot, file.path);
  const rel = relative(absoluteRoot, destination);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("refusing a path outside the workspace");
  }

  mkdirSync(dirname(destination), { recursive: true });
  const mode = file.mode === "0400" ? 0o400 : 0o600;
  // Create at the restrictive mode rather than widening later — a runner is
  // shared infrastructure and there must be no readable window.
  writeFileSync(destination, Buffer.from(file.content, "base64"), { mode });
  chmodSync(destination, mode);
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

    // ── Secret files ───────────────────────────────────────────────────
    const wantFiles = parseBooleanInput(core.getInput("files"), false);
    if (!wantFiles) {
      core.setOutput("files-count", 0);
      return;
    }

    const project = core.getInput("project");
    if (!project) {
      core.setFailed(
        "Envpilot: `project` is required when `files: true` — the files endpoint is project-scoped."
      );
      return;
    }

    let filesResult;
    try {
      filesResult = await pullFiles({
        apiUrl,
        token,
        environment,
        project,
      });
    } catch (error) {
      const message =
        error instanceof EnvpilotApiError || error instanceof Error
          ? error.message
          : "Unknown error while fetching secret files";
      core.setFailed(`Envpilot: ${message}`);
      return;
    }

    const root = core.getInput("files-dir") || process.cwd();
    let written = 0;
    for (const file of filesResult.files) {
      try {
        writeSecretFile(root, file);
        written += 1;
        // Name, path and size only. Contents are NEVER logged: masking a
        // multi-megabyte binary is not meaningful, so the rule is that they
        // never reach the log in the first place.
        core.info(
          `Envpilot: wrote ${file.path} (${file.size} bytes, mode ${file.mode})`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        core.setFailed(`Envpilot: could not write ${file.path} — ${message}`);
        return;
      }
    }

    core.info(
      `Envpilot: pulled ${written} secret file${written === 1 ? "" : "s"} for ${filesResult.environment}`
    );
    core.setOutput("files-count", written);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setFailed(`Envpilot: ${message}`);
  }
}
