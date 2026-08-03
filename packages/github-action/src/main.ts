import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import * as core from "@actions/core";
import { buildDotenvContent } from "./dotenv.js";
import {
  EnvpilotApiError,
  pullFiles,
  pullSecrets,
  type EnvpilotFile,
} from "./api.js";

/**
 * Per-request content budget for file pulls.
 *
 * The server refuses any single request whose files total over 8 MiB. Stay
 * under it with headroom rather than at it — the server counts plaintext
 * bytes but the response also carries base64 and JSON overhead.
 */
const MAX_BATCH_BYTES = 6 * 1024 * 1024;

/**
 * Greedily pack files into batches under `budget` bytes.
 *
 * A single file larger than the budget gets its own batch: the server may
 * still refuse it, but failing on that one file with a clear message beats
 * silently dropping it.
 */
function batchByTotalSize(
  files: EnvpilotFile[],
  budget: number
): EnvpilotFile[][] {
  const batches: EnvpilotFile[][] = [];
  let current: EnvpilotFile[] = [];
  let total = 0;
  for (const file of files) {
    if (current.length > 0 && total + file.size > budget) {
      batches.push(current);
      current = [];
      total = 0;
    }
    current.push(file);
    total += file.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

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
  if (file.content === undefined) {
    // A metadata-only row reaching the write path means the batching logic
    // asked for the wrong thing. Fail loudly rather than write an empty file
    // over a real one.
    throw new Error("server returned no content for this file");
  }
  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolve(absoluteRoot, file.path);
  const contained = (candidate: string): boolean => {
    const rel = relative(absoluteRoot, candidate);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };
  if (!contained(destination)) {
    throw new Error("refusing a path outside the workspace");
  }

  // Lexical containment is not enough: a directory inside the workspace can
  // be a symlink pointing out of it, and the normalised path still looks
  // contained. Resolve the deepest EXISTING ancestor for real.
  let ancestor = dirname(destination);
  while (!existsSync(ancestor) && contained(ancestor)) {
    ancestor = dirname(ancestor);
  }
  if (existsSync(ancestor)) {
    const realAncestor = realpathSync.native(ancestor);
    if (realAncestor !== absoluteRoot && !contained(realAncestor)) {
      throw new Error("refusing a path that escapes through a symlink");
    }
  }
  try {
    if (lstatSync(destination).isSymbolicLink()) {
      throw new Error("refusing to write through a symlink");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  // A pre-existing file keeps its old (possibly world-readable) mode while
  // new secret contents land in it, so stage into a fresh exclusive temp at
  // the restrictive mode and rename over the target instead.
  mkdirSync(dirname(destination), { recursive: true });
  const mode = file.mode === "0400" ? 0o400 : 0o600;
  const temp = `${destination}.envpilot-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, Buffer.from(file.content, "base64"), {
      mode,
      flag: "wx",
    });
    chmodSync(temp, mode);
    renameSync(temp, destination);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // Nothing useful to do — the write already failed.
    }
    throw error;
  }
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

    // Metadata first: path/size/checksum with nothing decrypted. It is what
    // lets the content pulls be BATCHED — the server refuses any single
    // request whose files total over 8 MiB, and the Action has no way to
    // know the sizes otherwise. Asking for everything at once failed the
    // whole job on any project with more than 8 MiB of secret files.
    let manifest;
    try {
      manifest = await pullFiles({
        apiUrl,
        token,
        environment,
        project,
        metadataOnly: true,
      });
    } catch (error) {
      const message =
        error instanceof EnvpilotApiError || error instanceof Error
          ? error.message
          : "Unknown error while fetching secret files";
      core.setFailed(`Envpilot: ${message}`);
      return;
    }

    const batches = batchByTotalSize(manifest.files, MAX_BATCH_BYTES);
    const files: EnvpilotFile[] = [];
    for (const batch of batches) {
      try {
        const chunk = await pullFiles({
          apiUrl,
          token,
          environment,
          project,
          paths: batch.map((f) => f.path),
        });
        files.push(...chunk.files);
      } catch (error) {
        const message =
          error instanceof EnvpilotApiError || error instanceof Error
            ? error.message
            : "Unknown error while fetching secret files";
        core.setFailed(`Envpilot: ${message}`);
        return;
      }
    }

    // Create and canonicalize the output root BEFORE any write. writeSecretFile
    // realpaths it, which throws ENOENT on a files-dir that does not exist yet
    // — so a nested output directory failed every pull.
    const configuredRoot = core.getInput("files-dir") || process.cwd();
    mkdirSync(configuredRoot, { recursive: true });
    const root = realpathSync.native(resolve(configuredRoot));

    let written = 0;
    for (const file of files) {
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
      `Envpilot: pulled ${written} secret file${written === 1 ? "" : "s"} for ${manifest.environment} in ${batches.length} request${batches.length === 1 ? "" : "s"}`
    );
    core.setOutput("files-count", written);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    core.setFailed(`Envpilot: ${message}`);
  }
}
