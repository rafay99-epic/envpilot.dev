import { readFileSync } from "node:fs";

/**
 * Everything the image needs to make a request, resolved from flags and the
 * environment. There is no config file and no login state — a container gets
 * exactly what its operator passed in, and nothing persists between runs.
 */
export interface ResolvedConfig {
  apiUrl: string;
  token: string;
  project: string;
  environment: string;
}

export const DEFAULT_API_URL = "https://www.envpilot.dev";

/** Raised for a bad invocation. Callers print `.message` and exit 2. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Read the API key.
 *
 * `ENVPILOT_TOKEN_FILE` wins over `ENVPILOT_TOKEN` because a mounted file is
 * the safer of the two: an environment variable is readable through
 * `docker inspect` and `/proc/<pid>/environ` by anyone with daemon access,
 * while a Compose/BuildKit secret is a tmpfs mount that never enters the
 * image or its history.
 *
 * There is deliberately no `--token` flag. A credential on a command line
 * lands in `ps`, in shell history, and in build logs.
 */
function resolveToken(env: NodeJS.ProcessEnv): string {
  const file = env.ENVPILOT_TOKEN_FILE?.trim();
  if (file) {
    let contents: string;
    try {
      contents = readFileSync(file, "utf-8");
    } catch {
      // Naming the path is safe and is almost always the actual mistake
      // (wrong mount target). The contents never reach the message.
      throw new ConfigError(
        `ENVPILOT_TOKEN_FILE points at ${file}, which could not be read.`
      );
    }
    // Trailing newlines are near-universal in mounted secret files and a
    // stray one turns every request into an opaque 401.
    const token = contents.trim();
    if (!token) {
      throw new ConfigError(
        `ENVPILOT_TOKEN_FILE points at ${file}, which is empty.`
      );
    }
    return token;
  }

  const inline = env.ENVPILOT_TOKEN?.trim();
  if (inline) return inline;

  throw new ConfigError(
    "No API key. Set ENVPILOT_TOKEN_FILE to a mounted secret (preferred) or ENVPILOT_TOKEN."
  );
}

/**
 * Merge parsed flags over environment variables.
 *
 * Flags win so a single image can serve several environments without being
 * rebuilt, which is the whole point of pulling config at runtime.
 */
export function resolveConfig(
  flags: { project?: string; env?: string; apiUrl?: string },
  env: NodeJS.ProcessEnv = process.env
): ResolvedConfig {
  const project = flags.project ?? env.ENVPILOT_PROJECT?.trim();
  if (!project) {
    throw new ConfigError(
      "No project. Pass --project <slug> or set ENVPILOT_PROJECT."
    );
  }

  const environment = flags.env ?? env.ENVPILOT_ENVIRONMENT?.trim();
  if (!environment) {
    throw new ConfigError(
      "No environment. Pass --env <name> or set ENVPILOT_ENVIRONMENT."
    );
  }

  const apiUrl = (
    flags.apiUrl ??
    env.ENVPILOT_API_URL?.trim() ??
    DEFAULT_API_URL
  ).replace(/\/+$/, "");

  return { apiUrl, token: resolveToken(env), project, environment };
}
