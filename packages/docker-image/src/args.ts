import { ConfigError } from "./config.js";

export type CommandName = "pull" | "files" | "exec";

export interface ParsedArgs {
  command: CommandName;
  project?: string;
  env?: string;
  apiUrl?: string;
  /** `pull --out <path>`; stdout when absent. */
  out?: string;
  /** `files --dir <path>`; defaults to the working directory. */
  dir?: string;
  /** `exec --files`: materialize secret files before running the command. */
  withFiles: boolean;
  quiet: boolean;
  /** Everything after `--`, for `exec`. */
  rest: string[];
}

const COMMANDS: CommandName[] = ["pull", "files", "exec"];

/** Flags that consume the following argument. */
const VALUE_FLAGS: Record<string, keyof ParsedArgs> = {
  "--project": "project",
  "-p": "project",
  "--env": "env",
  "-e": "env",
  "--api-url": "apiUrl",
  "--out": "out",
  "-o": "out",
  "--dir": "dir",
  "-d": "dir",
};

export const USAGE = `envpilot — pull Envpilot variables and secret files into a Docker build or container

Usage:
  envpilot pull  [flags]              Write variables as dotenv (stdout by default)
  envpilot files [flags]              Write secret files to their recorded paths
  envpilot exec  [flags] -- <cmd>     Inject variables and run <cmd>

Flags:
  -p, --project <slug>   Project slug           (or ENVPILOT_PROJECT)
  -e, --env <name>       Environment            (or ENVPILOT_ENVIRONMENT)
  -o, --out <path>       pull: write here at 0600 instead of stdout
  -d, --dir <path>       files: output directory (default: current directory)
      --files            exec: also write secret files before running
      --api-url <url>    API base URL           (or ENVPILOT_API_URL)
  -q, --quiet            Suppress the progress line on stderr
  -h, --help             Show this help
  -v, --version          Show the version

Credentials:
  ENVPILOT_TOKEN_FILE    Path to a mounted secret holding the API key (preferred)
  ENVPILOT_TOKEN         The API key inline

There is no --token flag on purpose: a credential on a command line is
visible in ps, in shell history, and in build logs.`;

/**
 * Parse argv. Deliberately hand-rolled — three commands and eight flags do
 * not justify a dependency inside a binary whose whole job is to stay small
 * and predictable.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;

  if (!command || !COMMANDS.includes(command as CommandName)) {
    throw new ConfigError(
      command
        ? `Unknown command "${command}". Expected one of: ${COMMANDS.join(", ")}.`
        : "No command given. Expected one of: " + COMMANDS.join(", ") + "."
    );
  }

  const parsed: ParsedArgs = {
    command: command as CommandName,
    withFiles: false,
    quiet: false,
    rest: [],
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;

    // Everything past `--` belongs to the child command, untouched.
    if (arg === "--") {
      parsed.rest = rest.slice(i + 1);
      break;
    }

    if (arg === "--files") {
      parsed.withFiles = true;
      continue;
    }
    if (arg === "--quiet" || arg === "-q") {
      parsed.quiet = true;
      continue;
    }

    const key = VALUE_FLAGS[arg];
    if (key) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new ConfigError(`${arg} needs a value.`);
      }
      // Every VALUE_FLAGS target is a string field on ParsedArgs.
      (parsed[key] as string) = value;
      i += 1;
      continue;
    }

    throw new ConfigError(`Unknown flag "${arg}". Run envpilot --help.`);
  }

  if (parsed.command === "exec" && parsed.rest.length === 0) {
    throw new ConfigError(
      "exec needs a command: envpilot exec --project api --env production -- ./server"
    );
  }

  return parsed;
}
