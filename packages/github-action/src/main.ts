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

/**
 * Run `attempt`, retrying only on a 429 and only for the cooldown the SERVER
 * asked for.
 *
 * Content pulls share the 30-requests-per-minute machine bucket, and batching
 * deliberately turns one logical pull into several requests — so a large Pro
 * project can legitimately reach the limit mid-pull. Treating that 429 as
 * terminal failed the job with half the keystores written, which is worse
 * than waiting. Bounded so a genuinely wedged limiter still fails the job
 * rather than burning the runner.
 */
async function withRateLimitRetry<T>(
  label: string,
  attempt: () => Promise<T>
): Promise<T> {
  const MAX_ATTEMPTS = 5;
  for (let i = 1; ; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      const is429 = error instanceof EnvpilotApiError && error.status === 429;
      if (!is429 || i >= MAX_ATTEMPTS) throw error;
      // Trust the server's cooldown; fall back to a short wait if it sent
      // none. Capped so a bad header cannot stall the job for hours.
      const waitSeconds = Math.min(error.retryAfterSeconds ?? 5, 60);
      core.info(
        `Envpilot: rate limited on ${label}, waiting ${waitSeconds}s (attempt ${i}/${MAX_ATTEMPTS})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
  }
}

function parseBooleanInput(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return fallback;
  return normalized === "true";
}

/**
 * Stage secret bytes into a fresh exclusive temp file and rename them over
 * `destination`.
 *
 * Two things this buys over a plain `writeFileSync`: a pre-existing file
 * never holds secret contents at its old (possibly world-readable) mode,
 * and a symlink at the destination is REFUSED rather than written through.
 *
 * Used by both the secret-files path and `env-file`, which previously wrote
 * straight to the caller's path with neither protection.
 */
function writeSecretBytes(
  destination: string,
  body: Buffer,
  mode: number
): void {
  try {
    if (lstatSync(destination).isSymbolicLink()) {
      throw new Error("refusing to write through a symlink");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  mkdirSync(dirname(destination), { recursive: true });
  const temp = `${destination}.envpilot-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, body, { mode, flag: "wx" });
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
  writeSecretBytes(
    destination,
    Buffer.from(file.content, "base64"),
    file.mode === "0400" ? 0o400 : 0o600
  );
}

/**
 * Values shorter than this are never registered as secrets.
 *
 * `core.setSecret("1")` replaces every `1` in the job's logs for the rest of
 * the run, which destroys the log without protecting anything meaningful.
 * `setSecret("")` is worse: it masks every line outright.
 */
const MIN_MASKABLE_VALUE = 4;

/**
 * Per-LINE floor for multiline values. One line of a larger secret is a
 * fragment, and short fragments collide with ordinary log text far more often
 * than whole values do, so the floor is higher.
 */
const MIN_MASKABLE_LINE = 6;

/**
 * Register `value` with the runner's log masker.
 *
 * The masker is LINE oriented: a value registered as a single multi-line blob
 * is never matched against the individual lines a later step prints, so a PEM
 * key or pretty-printed service-account JSON appeared in full in the log
 * despite having been "masked". Register the whole value AND each of its
 * lines.
 *
 * Returns false when the value was too short to mask safely, so the caller
 * can report how many went unmasked without naming any key.
 */
function maskValue(value: string): boolean {
  const maskable = value.trim().length >= MIN_MASKABLE_VALUE;
  if (maskable) core.setSecret(value);
  if (value.includes("\n")) {
    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length >= MIN_MASKABLE_LINE) core.setSecret(trimmed);
    }
  }
  return maskable;
}

/**
 * Environment names Envpilot data is never allowed to set.
 *
 * `core.exportVariable` writes to `$GITHUB_ENV`, which every later step in
 * the job inherits. A variable named `PATH`, `LD_PRELOAD` or `GITHUB_TOKEN`
 * would take over the rest of the job, and the MCP write tools let an agent
 * create variables, so the key is not fully under the repo owner's control.
 */
const RESERVED_ENV_KEYS = new Set([
  "BASH_ENV",
  "ENV",
  "GEM_PATH",
  "IFS",
  "JAVA_TOOL_OPTIONS",
  "JDK_JAVA_OPTIONS",
  "NODE_OPTIONS",
  "PATH",
  "PERL5LIB",
  "PYTHONHOME",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "RUBYOPT",
]);

// Prefixes, because each family has more members than is worth listing:
//
//   GIT_CONFIG_  GIT_CONFIG_COUNT with GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n
//                injects arbitrary git config, and core.sshCommand is config,
//                so a later checkout or push executes it.
//   BASH_FUNC_   exported shell functions, the Shellshock shape.
//   LD_ DYLD_    dynamic loader hooks: LD_PRELOAD, LD_AUDIT and relatives.
//   GITHUB_ RUNNER_ ACTIONS_  the runner's own namespaces, token included.
const RESERVED_ENV_PREFIXES = [
  "ACTIONS_",
  "BASH_FUNC_",
  "DYLD_",
  "GIT_CONFIG_",
  "GITHUB_",
  "LD_",
  "RUNNER_",
];

export function isReservedEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    RESERVED_ENV_KEYS.has(upper) ||
    RESERVED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))
  );
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
    // it. maskValue explains why a multiline value needs each of its lines
    // registered separately.
    let unmaskable = 0;
    for (const variable of variables) {
      if (!maskValue(variable.value)) unmaskable += 1;
    }
    if (unmaskable > 0) {
      core.info(
        `Envpilot: ${unmaskable} value(s) were too short to mask safely and are unmasked in this log.`
      );
    }

    if (exportEnv) {
      // A reserved name is refused rather than exported, because
      // $GITHUB_ENV is inherited by every later step. The key is named in
      // this one message, unlike anywhere else in the Action, because a
      // failure the user cannot diagnose is worse than naming a variable
      // the job is declining to use.
      const reserved = variables
        .map((variable) => variable.key)
        .filter(isReservedEnvKey);
      if (reserved.length > 0) {
        core.setFailed(
          `Envpilot: refusing to export reserved environment name(s): ${reserved.join(", ")}. Rename them, or scope them out of this environment.`
        );
        return;
      }
      for (const variable of variables) {
        core.exportVariable(variable.key, variable.value);
      }
    }

    if (envFile) {
      writeSecretBytes(
        resolve(envFile),
        Buffer.from(buildDotenvContent(variables), "utf8"),
        0o600
      );
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
      manifest = await withRateLimitRetry("file metadata", () =>
        pullFiles({
          apiUrl,
          token,
          environment,
          project,
          metadataOnly: true,
        })
      );
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
        const chunk = await withRateLimitRetry("file contents", () =>
          pullFiles({
            apiUrl,
            token,
            environment,
            project,
            paths: batch.map((f) => f.path),
          })
        );
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
