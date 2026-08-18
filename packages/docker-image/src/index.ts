import { chmodSync, writeFileSync } from "node:fs";
import { version } from "../package.json";
import { parseArgs, USAGE } from "./args.js";
import { ConfigError, resolveConfig } from "./config.js";
import { EnvpilotApiError, fetchVariables } from "./api.js";
import { buildDotenv } from "./dotenv.js";
import { pullSecretFiles, withRateLimitRetry } from "./files.js";
import { execWithVariables } from "./exec.js";

/**
 * Entry point for the Envpilot Docker image.
 *
 * Three commands, no state: `pull` writes a dotenv, `files` writes secret
 * files, `exec` injects variables into a child process. Nothing is cached and
 * no config is persisted, so the same binary behaves identically in a
 * BuildKit mount and as a container ENTRYPOINT.
 *
 * Exit codes: 0 success, 1 request or write failure, 2 bad invocation, and
 * for `exec` the child's own code (or 128+signal).
 */

/** Progress goes to stderr so `pull` can stream dotenv text on stdout. */
function note(quiet: boolean, message: string): void {
  if (!quiet) process.stderr.write(`envpilot: ${message}\n`);
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  const args = parseArgs(argv);
  const config = resolveConfig(args);

  if (args.command === "files") {
    const written = await pullSecretFiles(config, args.dir ?? process.cwd());
    // Paths and counts only. Contents are NEVER logged: masking a
    // multi-megabyte binary is not meaningful, so the rule is that they
    // never reach the log in the first place.
    for (const path of written) note(args.quiet, `wrote ${path}`);
    note(
      args.quiet,
      `${written.length} secret file${written.length === 1 ? "" : "s"} for ${config.project}/${config.environment}`
    );
    return 0;
  }

  const variables = await withRateLimitRetry("variables", () =>
    fetchVariables(config)
  );
  note(
    args.quiet,
    `pulled ${variables.length} variable${variables.length === 1 ? "" : "s"} from ${config.project}/${config.environment}`
  );

  if (args.command === "pull") {
    const content = buildDotenv(variables);
    if (args.out) {
      // writeFileSync only applies `mode` when it CREATES the file, so chmod
      // explicitly — an existing file at this path would otherwise keep its
      // old, possibly world-readable, mode.
      writeFileSync(args.out, content, { mode: 0o600 });
      chmodSync(args.out, 0o600);
      note(args.quiet, `wrote ${args.out}`);
    } else {
      process.stdout.write(content);
    }
    return 0;
  }

  if (args.withFiles) {
    const written = await pullSecretFiles(config, args.dir ?? process.cwd());
    note(
      args.quiet,
      `${written.length} secret file${written.length === 1 ? "" : "s"} written`
    );
  }

  return execWithVariables(args.rest, variables);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // Bad invocation is the user's typo; everything else is a real failure.
    // Both fail loudly and completely — a build that stops beats an image
    // carrying half its configuration.
    if (error instanceof ConfigError) {
      process.stderr.write(`envpilot: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    const message =
      error instanceof EnvpilotApiError || error instanceof Error
        ? error.message
        : "unknown error";
    process.stderr.write(`envpilot: ${message}\n`);
    process.exitCode = 1;
  });
