/**
 * Static scan of the things between `envpilot run` and the running process.
 *
 * Every support thread that starts with "envpilot injected the variable but my
 * app still says it is undefined" ends at one of these: turbo filtering the
 * environment, a compose service with no env passthrough, a wrapper command
 * that rebuilds the environment, or a local .env file overwriting the injected
 * value. None of it needs a login or a network, so this module takes a
 * directory and returns findings. That keeps it unit-testable and lets
 * `doctor` run the half that matters most before a user has an account.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { z } from "zod";
import { readEnvFile } from "../env-file.js";

// ── Result shapes ───────────────────────────────────────────────────────────

export interface TurboScan {
  /** No turbo.json at the root: nothing to say. */
  present: boolean;
  /** Effective root mode. Turbo 2.x defaults to strict when unset. */
  envMode: "strict" | "loose";
  /** Tasks running strict that declare neither `env` nor `passThroughEnv`. */
  filteringTasks: string[];
  /** True when `globalPassThroughEnv` contains "*", which unblocks every task. */
  globalPassThroughAll: boolean;
  /** Set when the file exists but could not be read as JSON. */
  parseError?: string;
}

export interface ComposeService {
  file: string;
  service: string;
}

export interface ComposeScan {
  files: string[];
  /** Services declaring neither `env_file` nor `environment`. */
  servicesWithoutEnv: ComposeService[];
}

export interface WrapperHit {
  /** Where the script lives, e.g. "package.json" or "apps/web/package.json". */
  source: string;
  /** Script name, or the Procfile process name. */
  name: string;
  /** Wrapper commands found in the script body. */
  wrappers: string[];
}

export interface ShadowFile {
  file: string;
  /** Key NAMES only. A scan never reads a value into its output. */
  keys: string[];
  /** Keys that also exist in the injected set. Empty when the set is unknown. */
  overlapping: string[];
}

export interface RuntimeScan {
  nodeMajor: number;
  nodeVersion: string;
  /** `envpilot mount` needs a FIFO; Windows has none. */
  hasMkfifo: boolean;
  platform: NodeJS.Platform;
}

export interface DeliveryScan {
  root: string;
  turbo: TurboScan;
  compose: ComposeScan;
  wrappers: WrapperHit[];
  shadows: ShadowFile[];
  runtime: RuntimeScan;
}

export interface ScanOptions {
  /**
   * Keys Envpilot would inject. Supplied, the shadow check reports which local
   * .env keys overwrite an injected value; omitted (signed out), it reports
   * the files and their keys without the overlap.
   */
  injectedKeys?: ReadonlySet<string>;
}

/**
 * Scan `root` for anything that drops an injected environment variable on the
 * way to the child process.
 */
export function scanDelivery(
  root: string,
  options: ScanOptions = {}
): DeliveryScan {
  return {
    root,
    turbo: scanTurbo(root),
    compose: scanCompose(root),
    wrappers: scanWrappers(root),
    shadows: scanShadows(root, options.injectedKeys),
    runtime: scanRuntime(),
  };
}

// ── Turbo ───────────────────────────────────────────────────────────────────

const turboTaskSchema = z.object({
  env: z.array(z.string()).optional(),
  passThroughEnv: z.array(z.string()).nullish(),
  envMode: z.string().optional(),
  cache: z.boolean().optional(),
});

const turboSchema = z.object({
  envMode: z.string().optional(),
  globalPassThroughEnv: z.array(z.string()).nullish(),
  // `pipeline` is the turbo 1.x spelling of `tasks`.
  tasks: z.record(z.string(), turboTaskSchema).optional(),
  pipeline: z.record(z.string(), turboTaskSchema).optional(),
});

const EMPTY_TURBO: TurboScan = {
  present: false,
  envMode: "strict",
  filteringTasks: [],
  globalPassThroughAll: false,
};

function scanTurbo(root: string): TurboScan {
  const path = join(root, "turbo.json");
  if (!existsSync(path)) return EMPTY_TURBO;

  let parsed: z.infer<typeof turboSchema>;
  try {
    parsed = turboSchema.parse(JSON.parse(stripJsonComments(read(path))));
  } catch (err) {
    return {
      ...EMPTY_TURBO,
      present: true,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }

  const rootMode = parsed.envMode === "loose" ? "loose" : "strict";
  const globalPassThroughAll =
    parsed.globalPassThroughEnv?.includes("*") ?? false;
  const tasks = parsed.tasks ?? parsed.pipeline ?? {};

  const filteringTasks = globalPassThroughAll
    ? []
    : Object.entries(tasks).flatMap(([name, task]) => {
        const mode = task.envMode ?? rootMode;
        if (mode === "loose") return [];
        const declaresNothing =
          !task.env?.length && !task.passThroughEnv?.length;
        return declaresNothing ? [name] : [];
      });

  return {
    present: true,
    envMode: rootMode,
    filteringTasks,
    globalPassThroughAll,
  };
}

/**
 * Turbo accepts comments in turbo.json, JSON.parse does not. Only whole-line
 * comments are stripped, so the `//` inside the `$schema` URL survives.
 */
function stripJsonComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

// ── Docker Compose ──────────────────────────────────────────────────────────

const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

function scanCompose(root: string): ComposeScan {
  const files: string[] = [];
  const servicesWithoutEnv: ComposeService[] = [];

  for (const name of COMPOSE_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    files.push(name);
    for (const service of servicesMissingEnv(read(path))) {
      servicesWithoutEnv.push({ file: name, service });
    }
  }

  return { files, servicesWithoutEnv };
}

/**
 * Indentation walk of the top-level `services:` block.
 *
 * ponytail: no YAML dependency for one block. The ceiling is flow style
 * (`services: {web: {...}}`), anchors and multi-document files, which this
 * reads as "no services" rather than guessing. Pull in `yaml` if that stops
 * being acceptable.
 */
function servicesMissingEnv(content: string): string[] {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^services:\s*(#.*)?$/.test(line));
  if (start === -1) return [];

  const missing: string[] = [];
  let serviceIndent: number | null = null;
  let current: string | null = null;
  let hasEnv = false;

  const flush = (): void => {
    if (current !== null && !hasEnv) missing.push(current);
  };

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    // Back to column zero: the services block ended.
    if (indent === 0) break;

    if (serviceIndent === null) serviceIndent = indent;

    if (indent === serviceIndent) {
      const name = /^([A-Za-z0-9._-]+):/.exec(line.trim())?.[1];
      if (name) {
        flush();
        current = name;
        hasEnv = false;
      }
      continue;
    }

    if (
      indent > serviceIndent &&
      /^(env_file|environment)\s*:/.test(line.trim())
    ) {
      hasEnv = true;
    }
  }
  flush();

  return missing;
}

// ── Wrapper commands ────────────────────────────────────────────────────────

/**
 * Commands that build their own environment for the process they start, so an
 * injected variable reaches them and stops there.
 */
const WRAPPER_PATTERN =
  /\b(turbo|docker-compose|docker|sudo|ssh|cross-env|dotenv-cli|dotenv)\b|\benv\s+-i\b/g;

const packageJsonSchema = z.object({
  scripts: z.record(z.string(), z.string()).optional(),
  workspaces: z.array(z.string()).optional(),
});

function scanWrappers(root: string): WrapperHit[] {
  const hits: WrapperHit[] = [];
  const rootPkg = readPackageJson(join(root, "package.json"));

  collectScriptHits("package.json", rootPkg?.scripts, hits);
  for (const dir of workspaceDirs(root, rootPkg?.workspaces)) {
    const relative = `${dir}/package.json`;
    collectScriptHits(
      relative,
      readPackageJson(join(root, relative))?.scripts,
      hits
    );
  }

  const procfile = join(root, "Procfile");
  if (existsSync(procfile)) {
    for (const line of read(procfile).split("\n")) {
      const match = /^([A-Za-z0-9_-]+):\s*(.+)$/.exec(line.trim());
      if (match) collectHit("Procfile", match[1], match[2], hits);
    }
  }

  return hits;
}

function collectScriptHits(
  source: string,
  scripts: Record<string, string> | undefined,
  hits: WrapperHit[]
): void {
  for (const [name, body] of Object.entries(scripts ?? {})) {
    collectHit(source, name, body, hits);
  }
}

function collectHit(
  source: string,
  name: string,
  body: string,
  hits: WrapperHit[]
): void {
  const wrappers = [...new Set(body.match(WRAPPER_PATTERN) ?? [])];
  if (wrappers.length > 0) hits.push({ source, name, wrappers });
}

function readPackageJson(
  path: string
): z.infer<typeof packageJsonSchema> | null {
  if (!existsSync(path)) return null;
  try {
    return packageJsonSchema.parse(JSON.parse(read(path)));
  } catch {
    return null;
  }
}

/** Expand `["apps/*"]` style workspace globs one level deep. */
function workspaceDirs(root: string, globs: string[] | undefined): string[] {
  const dirs: string[] = [];
  for (const glob of globs ?? []) {
    const star = glob.indexOf("*");
    if (star === -1) {
      dirs.push(glob.replace(/\/$/, ""));
      continue;
    }
    const parent = glob.slice(0, star).replace(/\/$/, "");
    try {
      for (const entry of readdirSync(join(root, parent), {
        withFileTypes: true,
      })) {
        if (entry.isDirectory()) dirs.push(`${parent}/${entry.name}`);
      }
    } catch {
      // Missing workspace directory is not a finding.
    }
  }
  return dirs;
}

// ── Local .env shadowing ────────────────────────────────────────────────────

/** Templates are meant to be committed and never loaded, so they never shadow. */
/**
 * Suffixes that mark a checked-in TEMPLATE rather than a real env file.
 * These are meant to be committed, so flagging them as leaked secrets is the
 * kind of false positive that teaches people to ignore the tool.
 */
export const TEMPLATE_SUFFIXES = [".example", ".sample", ".template", ".dist"];

/** Whether a path is a committed template rather than a real env file. */
export function isEnvTemplate(path: string): boolean {
  return TEMPLATE_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

function scanShadows(
  root: string,
  injectedKeys: ReadonlySet<string> | undefined
): ShadowFile[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }

  const shadows: ShadowFile[] = [];
  for (const name of entries.sort()) {
    if (!/^\.env($|\.)/.test(name)) continue;
    if (TEMPLATE_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;

    let keys: string[];
    try {
      const parsed = readEnvFile(join(root, name));
      if (!parsed) continue;
      keys = Object.keys(parsed);
    } catch {
      // A directory or an unreadable file is not a shadowing finding.
      continue;
    }
    shadows.push({
      file: name,
      keys,
      overlapping: injectedKeys
        ? keys.filter((key) => injectedKeys.has(key))
        : [],
    });
  }
  return shadows;
}

// ── Runtime ─────────────────────────────────────────────────────────────────

function scanRuntime(): RuntimeScan {
  const nodeVersion = process.versions.node;
  return {
    nodeVersion,
    nodeMajor: parseInt(nodeVersion.split(".")[0], 10) || 0,
    hasMkfifo: isOnPath("mkfifo"),
    platform: process.platform,
  };
}

/** PATH lookup without spawning a shell, so the scan stays side-effect free. */
function isOnPath(binary: string): boolean {
  if (process.platform === "win32") return false;
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((dir) => {
      try {
        return statSync(join(dir, binary)).isFile();
      } catch {
        return false;
      }
    });
}

function read(path: string): string {
  return readFileSync(path, "utf-8");
}
