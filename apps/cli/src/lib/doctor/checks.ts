/**
 * Check definitions and the runner behind `envpilot doctor`.
 *
 * A check is DATA, not a print statement. The text renderer, the `--json`
 * renderer and the exit code all read the same tree, so the three can never
 * disagree about whether something failed. Adding a check means appending a
 * `CheckResult`, not touching output code.
 *
 * The probes run once, up front, and every group is then a pure mapping from
 * probe outcome to results. That is why `doctor` costs one session round trip
 * and one secret resolve no matter how many checks reference them.
 */

import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createAPIClient } from "../api.js";
import { CLI_VERSION } from "../cli-version.js";
import {
  getActiveAccount,
  getActiveOrganizationId,
  getApiUrl,
  getConfigPath,
  isAuthenticated,
} from "../config.js";
import {
  addToGitignore,
  ensureEnvInGitignore,
  findProjectConfigDir,
  getActiveProject,
  getTrackedEnvFiles,
  isGitRepo,
  readProjectConfigV2,
  resolveProject,
} from "../project-config.js";
import { sanitizeConvexError } from "../errors.js";
import type { ProjectEntry } from "../../types/index.js";
import { ENVIRONMENTS, resolveEnvironment } from "../validators.js";
import { getCacheStats } from "../variables-cache.js";
import { evaluateVersion } from "../version-check.js";
import {
  describeProblem,
  isBlocking,
  type Problem,
} from "../secrets/problems.js";
import { resolveSecrets } from "../secrets/resolve.js";
import { scanDelivery, isEnvTemplate, type DeliveryScan } from "./scan.js";

export type Status = "pass" | "warn" | "fail" | "skip";

export interface CheckResult {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  fix?: string;
}

export interface CheckGroup {
  title: string;
  results: CheckResult[];
}

export interface DoctorSummary {
  failed: number;
  warnings: number;
  passed: number;
  skipped: number;
}

/** Bump when the --json shape changes in a way a consumer could notice. */
export const DOCTOR_REPORT_VERSION = 1;

export interface DoctorReport {
  /** Schema version of this report; see DOCTOR_REPORT_VERSION. */
  version: number;
  groups: CheckGroup[];
  summary: DoctorSummary;
  /** Repairs `--fix` actually applied, in the order they ran. */
  fixesApplied: string[];
  /** Drives exit code 2, which outranks a plain check failure. */
  authenticated: boolean;
}

export interface DoctorOptions {
  project?: string;
  env?: string;
  fix?: boolean;
  quiet?: boolean;
}

/**
 * Run every check and return the report. Never throws for a failing check:
 * a failure is a result, and only an unexpected crash escapes to the caller.
 */
export async function runDoctor(
  options: DoctorOptions = {}
): Promise<DoctorReport> {
  const authed = isAuthenticated();
  const cwd = process.cwd();
  const configDir = findProjectConfigDir(cwd);
  const root = configDir ?? cwd;

  const linkedConfig = readProjectConfigV2();
  const project = linkedConfig
    ? options.project
      ? resolveProject(linkedConfig, options.project)
      : getActiveProject(linkedConfig)
    : null;

  const requestedEnv = options.env ?? project?.environment;
  const environment = requestedEnv ? resolveEnvironment(requestedEnv) : null;

  const [session, version] = await Promise.all([
    probeSession(authed),
    probeVersion(),
  ]);

  const projectProbe = await probeProject(session, project);
  const secrets = await probeSecrets(session, project, environment);

  const scan = scanDelivery(root, {
    injectedKeys: secrets.kind === "ok" ? secrets.keys : undefined,
  });

  const fixesApplied: string[] = [];
  const groups: CheckGroup[] = [
    identityGroup(session, version),
    linkGroup(
      { cwd, configDir, project, requestedEnv, environment },
      projectProbe,
      options,
      fixesApplied
    ),
    reachGroup(session, secrets),
    secretsGroup(secrets),
    deliveryGroup(scan),
    hygieneGroup(root, options, fixesApplied),
  ];

  return {
    version: DOCTOR_REPORT_VERSION,
    groups,
    summary: summarize(groups),
    fixesApplied,
    authenticated: authed,
  };
}

// ── Probes ──────────────────────────────────────────────────────────────────

type SessionProbe =
  | { kind: "ok"; ms: number; email: string }
  | { kind: "failed"; ms: number; message: string }
  | { kind: "signed-out" };

type VersionProbe =
  | { kind: "ok"; latest?: string; min?: string }
  | { kind: "failed"; message: string };

type ProjectProbe =
  | { kind: "ok"; name: string }
  | { kind: "org-mismatch"; expected: string; actual: string }
  | { kind: "failed"; message: string }
  | { kind: "skipped"; reason: string };

type SecretsProbe =
  | {
      kind: "ok";
      keys: Set<string>;
      problems: Problem[];
      fromCache: boolean;
      cacheAge: string;
    }
  | { kind: "failed"; message: string }
  | { kind: "skipped"; reason: string };

/** One authed Convex round trip: proves the token refreshes and the backend answers. */
async function probeSession(authed: boolean): Promise<SessionProbe> {
  if (!authed) return { kind: "signed-out" };
  const started = Date.now();
  try {
    const user = await createAPIClient().getCurrentUser();
    return { kind: "ok", ms: Date.now() - started, email: user.email };
  } catch (err) {
    return {
      kind: "failed",
      ms: Date.now() - started,
      message: sanitizeConvexError(err),
    };
  }
}

/**
 * Read the release manifest live rather than through the cached enforcement
 * path: doctor exists to report the truth right now, not what was cached an
 * hour ago. /api/version is unauthenticated, so this runs signed out too.
 */
/**
 * Deliberately NOT version-check.ts's fetchVersionInfo. That one collapses
 * every failure to null because the hot path only needs "cannot decide";
 * doctor's whole job is to say WHY it could not decide, so it keeps the
 * reason. Same request, different contract.
 */
async function probeVersion(): Promise<VersionProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  timer.unref?.();
  try {
    const res = await fetch(`${getApiUrl()}/api/version`, {
      signal: controller.signal,
    });
    if (!res.ok) return { kind: "failed", message: `HTTP ${res.status}` };
    const body = (await res.json()) as { cli?: string; minCli?: string };
    return { kind: "ok", latest: body.cli, min: body.minCli };
  } catch (err) {
    return {
      kind: "failed",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeProject(
  session: SessionProbe,
  project: ProjectEntry | null
): Promise<ProjectProbe> {
  if (session.kind !== "ok")
    return { kind: "skipped", reason: "needs a live session" };
  if (!project) return { kind: "skipped", reason: "no linked project" };
  try {
    const remote = await createAPIClient().getProject(project.projectId);
    if (remote.organizationId !== project.organizationId) {
      return {
        kind: "org-mismatch",
        expected: project.organizationId,
        actual: remote.organizationId,
      };
    }
    return { kind: "ok", name: remote.name };
  } catch (err) {
    return { kind: "failed", message: sanitizeConvexError(err) };
  }
}

async function probeSecrets(
  session: SessionProbe,
  project: ProjectEntry | null,
  environment: string | null
): Promise<SecretsProbe> {
  if (session.kind !== "ok")
    return { kind: "skipped", reason: "needs a live session" };
  if (!project) return { kind: "skipped", reason: "no linked project" };
  if (!environment) return { kind: "skipped", reason: "no valid environment" };

  try {
    const resolved = await resolveSecrets({
      projectId: project.projectId,
      projectName: project.projectName,
      environment,
      organizationId: project.organizationId,
      useCache: true,
      // 0 = verify freshness against the server, the same default `run` uses,
      // so doctor reports the set a run would actually inject.
      ttlSeconds: 0,
      // Always quiet: doctor renders every condition itself, so resolveSecrets
      // must not interleave a spinner or a warning line into the report.
      quiet: true,
    });
    return {
      kind: "ok",
      keys: new Set(resolved.values.keys()),
      problems: resolved.problems,
      fromCache: resolved.fromCache,
      cacheAge: resolved.cacheAge,
    };
  } catch (err) {
    return { kind: "failed", message: sanitizeConvexError(err) };
  }
}

// ── Group 1: Identity ───────────────────────────────────────────────────────

function identityGroup(
  session: SessionProbe,
  version: VersionProbe
): CheckGroup {
  const account = getActiveAccount();
  const results: CheckResult[] = [];

  results.push(
    session.kind === "signed-out"
      ? {
          id: "identity.signed-in",
          label: "Signed in",
          status: "fail",
          detail: `No account in ${getConfigPath()}`,
          fix: "envpilot login",
        }
      : {
          id: "identity.signed-in",
          label: "Signed in",
          status: "pass",
          detail: account?.user.email,
        }
  );

  results.push(
    session.kind === "signed-out"
      ? skip("identity.token", "Session token accepted", "not signed in")
      : session.kind === "ok"
        ? {
            id: "identity.token",
            label: "Session token accepted",
            status: "pass",
            detail: `Refreshed and verified as ${session.email}`,
          }
        : {
            id: "identity.token",
            label: "Session token accepted",
            status: "fail",
            detail: session.message,
            fix: "envpilot login",
          }
  );

  results.push(
    session.kind === "signed-out"
      ? skip(
          "identity.context",
          "Active account and organization",
          "not signed in"
        )
      : {
          id: "identity.context",
          label: "Active account and organization",
          status: getActiveOrganizationId() ? "pass" : "warn",
          detail: `${account?.user.email ?? "unknown"} · org ${getActiveOrganizationId() ?? "(none selected)"}`,
          fix: getActiveOrganizationId() ? undefined : "envpilot switch",
        }
  );

  results.push(versionCheck(version));
  return { title: "Identity", results };
}

function versionCheck(version: VersionProbe): CheckResult {
  if (version.kind === "failed") {
    return {
      id: "identity.version",
      label: "CLI version",
      status: "warn",
      detail: `${CLI_VERSION} · could not reach ${getApiUrl()}/api/version (${version.message})`,
    };
  }

  const { blocked, updateAvailable } = evaluateVersion(
    CLI_VERSION,
    version.latest,
    version.min
  );
  const context = `latest ${version.latest ?? "unknown"}, minimum ${version.min ?? "unknown"}`;

  if (blocked) {
    return {
      id: "identity.version",
      label: "CLI version",
      status: "fail",
      detail: `${CLI_VERSION} is below the minimum supported version (${context})`,
      fix: "npm install -g @envpilot/cli@latest",
    };
  }
  if (updateAvailable) {
    return {
      id: "identity.version",
      label: "CLI version",
      status: "warn",
      detail: `${CLI_VERSION} · update available (${context})`,
      fix: "npm install -g @envpilot/cli@latest",
    };
  }
  return {
    id: "identity.version",
    label: "CLI version",
    status: "pass",
    detail: `${CLI_VERSION} · ${context}`,
  };
}

// ── Group 2: Link ───────────────────────────────────────────────────────────

interface LinkContext {
  cwd: string;
  configDir: string | null;
  project: ProjectEntry | null;
  requestedEnv: string | undefined;
  environment: string | null;
}

function linkGroup(
  ctx: LinkContext,
  probe: ProjectProbe,
  options: DoctorOptions,
  fixesApplied: string[]
): CheckGroup {
  const results: CheckResult[] = [];

  if (!ctx.configDir) {
    results.push({
      id: "link.config",
      label: ".envpilot found",
      status: "fail",
      detail: `No .envpilot at or above ${ctx.cwd}`,
      fix: "envpilot init",
    });
  } else {
    const up = relative(ctx.configDir, ctx.cwd);
    const depth = up === "" ? 0 : up.split(sep).length;
    results.push({
      id: "link.config",
      label: ".envpilot found",
      status: "pass",
      detail: `${join(ctx.configDir, ".envpilot")} (${depth === 0 ? "this directory" : `${depth} ${depth === 1 ? "directory" : "directories"} up`})`,
    });
  }

  results.push(projectCheck(ctx, probe));
  results.push(environmentCheck(ctx));
  results.push(envpilotIgnoredCheck(ctx.configDir, options, fixesApplied));

  return { title: "Link", results };
}

function projectCheck(ctx: LinkContext, probe: ProjectProbe): CheckResult {
  if (!ctx.project) {
    return {
      id: "link.project",
      label: "Project resolves",
      status: "fail",
      detail: "No project entry in .envpilot",
      fix: "envpilot init",
    };
  }
  const local = `${ctx.project.projectName || ctx.project.projectId} · org ${ctx.project.organizationId}`;
  switch (probe.kind) {
    case "ok":
      return {
        id: "link.project",
        label: "Project resolves",
        status: "pass",
        detail: `${probe.name} (${ctx.project.projectId})`,
      };
    case "org-mismatch":
      return {
        id: "link.project",
        label: "Project resolves",
        status: "fail",
        detail: `.envpilot says org ${probe.expected}, the server says ${probe.actual}`,
        fix: "envpilot unlink && envpilot init",
      };
    case "failed":
      return {
        id: "link.project",
        label: "Project resolves",
        status: "fail",
        detail: probe.message,
        fix: "envpilot list projects",
      };
    case "skipped":
      return skip(
        "link.project",
        "Project resolves",
        `${probe.reason} (local: ${local})`
      );
  }
}

function environmentCheck(ctx: LinkContext): CheckResult {
  if (!ctx.requestedEnv) {
    return skip(
      "link.environment",
      "Environment name",
      "no environment selected"
    );
  }
  if (!ctx.environment) {
    return {
      id: "link.environment",
      label: "Environment name",
      status: "fail",
      detail: `"${ctx.requestedEnv}" is not an environment`,
      fix: `use one of ${ENVIRONMENTS.join(", ")}`,
    };
  }
  return {
    id: "link.environment",
    label: "Environment name",
    status: "pass",
    detail:
      ctx.environment === ctx.requestedEnv
        ? ctx.environment
        : `${ctx.requestedEnv} → ${ctx.environment}`,
  };
}

function envpilotIgnoredCheck(
  configDir: string | null,
  options: DoctorOptions,
  fixesApplied: string[]
): CheckResult {
  const id = "link.gitignore";
  const label = ".envpilot ignored by git";
  if (!configDir) return skip(id, label, "no .envpilot");
  if (!isGitRepo(configDir)) return skip(id, label, "not a git repository");
  if (gitignoreHas(configDir, ".envpilot")) {
    return { id, label, status: "pass" };
  }
  if (options.fix) {
    addToGitignore(configDir);
    if (gitignoreHas(configDir, ".envpilot")) {
      fixesApplied.push(`added .envpilot to ${join(configDir, ".gitignore")}`);
      return { id, label, status: "pass", detail: "added by --fix" };
    }
  }
  return {
    id,
    label,
    status: "warn",
    detail: ".envpilot records project and org ids and should stay out of git",
    fix: "envpilot doctor --fix",
  };
}

// ── Group 3: Reach ──────────────────────────────────────────────────────────

function reachGroup(session: SessionProbe, secrets: SecretsProbe): CheckGroup {
  const results: CheckResult[] = [];

  switch (session.kind) {
    case "signed-out":
      results.push(skip("reach.convex", "Convex reachable", "not signed in"));
      break;
    case "ok":
      results.push({
        id: "reach.convex",
        label: "Convex reachable",
        status: session.ms > 2000 ? "warn" : "pass",
        detail: `round trip ${session.ms}ms`,
      });
      break;
    case "failed":
      results.push({
        id: "reach.convex",
        label: "Convex reachable",
        status: "fail",
        detail: `${session.message} (after ${session.ms}ms)`,
      });
      break;
  }

  results.push(vaultCheck(secrets));
  results.push(apiUrlCheck());
  return { title: "Reach", results };
}

function vaultCheck(secrets: SecretsProbe): CheckResult {
  const id = "reach.vault";
  const label = "Vault decrypt path";
  switch (secrets.kind) {
    case "skipped":
      return skip(id, label, secrets.reason);
    case "failed":
      return { id, label, status: "fail", detail: secrets.message };
    case "ok": {
      const failed = secrets.problems.find((p) => p.kind === "decrypt-failed");
      if (failed) {
        return {
          id,
          label,
          status: "fail",
          detail: describeProblem(failed),
        };
      }
      if (secrets.fromCache) {
        return {
          id,
          label,
          status: "warn",
          detail: `served from the local run cache (age ${secrets.cacheAge}); the vault was not exercised`,
          fix: "envpilot run --no-cache -- true",
        };
      }
      return {
        id,
        label,
        status: "pass",
        detail: `decrypted ${secrets.keys.size} ${secrets.keys.size === 1 ? "value" : "values"}`,
      };
    }
  }
}

/**
 * The apex host 307-redirects to www and Node's fetch drops the Authorization
 * header across that hop, which surfaces as a false 401. config.ts normalizes
 * on read, so this is the guard that notices if that ever stops happening.
 */
function apiUrlCheck(): CheckResult {
  const id = "reach.api-url";
  const label = "API URL canonical";
  const url = getApiUrl();
  let host: string;
  let protocol: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    protocol = parsed.protocol;
  } catch {
    return {
      id,
      label,
      status: "fail",
      detail: `${url} is not a valid URL`,
      fix: "envpilot config set apiUrl https://www.envpilot.dev",
    };
  }

  if (host === "envpilot.dev") {
    return {
      id,
      label,
      status: "fail",
      detail: `${url} redirects to www and strips the auth header`,
      fix: "envpilot config set apiUrl https://www.envpilot.dev",
    };
  }
  const localhost = host === "localhost" || host === "127.0.0.1";
  if (protocol !== "https:" && !localhost) {
    return {
      id,
      label,
      status: "warn",
      detail: `${url} is not https`,
      fix: "envpilot config set apiUrl https://www.envpilot.dev",
    };
  }
  return { id, label, status: "pass", detail: url };
}

// ── Group 4: Secrets ────────────────────────────────────────────────────────

function secretsGroup(secrets: SecretsProbe): CheckGroup {
  const results: CheckResult[] = [];

  switch (secrets.kind) {
    case "skipped":
      results.push(
        skip("secrets.resolved", "Secrets resolved", secrets.reason)
      );
      break;
    case "failed":
      results.push({
        id: "secrets.resolved",
        label: "Secrets resolved",
        status: "fail",
        detail: secrets.message,
      });
      break;
    case "ok": {
      results.push({
        id: "secrets.resolved",
        label: "Secrets resolved",
        status: "pass",
        detail: `${secrets.keys.size} ${secrets.keys.size === 1 ? "key" : "keys"}${secrets.fromCache ? ` (cache, age ${secrets.cacheAge})` : ""}`,
      });
      if (secrets.problems.length === 0) {
        results.push({
          id: "secrets.problems",
          label: "No resolve problems",
          status: "pass",
        });
      }
      for (const problem of secrets.problems) {
        results.push({
          id: `secrets.${problem.kind}`,
          label: problemLabel(problem),
          status: isBlocking(problem) ? "fail" : "warn",
          detail: describeProblem(problem),
          fix: problemFix(problem),
        });
      }
      break;
    }
  }

  return { title: "Secrets", results };
}

function problemLabel(problem: Problem): string {
  switch (problem.kind) {
    case "decrypt-failed":
      return "Vault decryption";
    case "truncated":
      return "Complete result set";
    case "missing-required":
      return "Required keys present";
    case "scope-restricted":
      return "Role scope";
    case "other-environments":
      return "Keys in other environments";
  }
}

function problemFix(problem: Problem): string | undefined {
  switch (problem.kind) {
    case "decrypt-failed":
      return "re-set the affected keys with `envpilot push` or from the dashboard";
    case "truncated":
      return "split the project, or contact support: the server capped the read";
    case "missing-required":
      return "add the keys, or drop them from --require";
    case "scope-restricted":
      return "ask an owner for a wider variable grant if keys look missing";
    case "other-environments":
      return "run with -e <environment>, or add the keys to this environment";
  }
}

// ── Group 5: Delivery ───────────────────────────────────────────────────────

function deliveryGroup(scan: DeliveryScan): CheckGroup {
  return {
    title: "Delivery",
    results: [
      turboCheck(scan),
      composeCheck(scan),
      wrapperCheck(scan),
      shadowCheck(scan),
      {
        id: "delivery.node",
        label: "Node runtime",
        status: scan.runtime.nodeMajor >= 22 ? "pass" : "warn",
        detail: `v${scan.runtime.nodeVersion} on ${scan.runtime.platform}`,
        fix:
          scan.runtime.nodeMajor >= 22 ? undefined : "install Node 22 or newer",
      },
      {
        id: "delivery.mkfifo",
        label: "mkfifo available",
        status: scan.runtime.hasMkfifo ? "pass" : "warn",
        detail: scan.runtime.hasMkfifo
          ? undefined
          : "`envpilot mount` needs a FIFO and cannot run here",
        fix: scan.runtime.hasMkfifo ? undefined : "use `envpilot run` instead",
      },
    ],
  };
}

function turboCheck(scan: DeliveryScan): CheckResult {
  const id = "delivery.turbo";
  const label = "Turbo passes the environment through";
  const { turbo } = scan;

  if (!turbo.present) return skip(id, label, "no turbo.json");
  if (turbo.parseError) {
    return {
      id,
      label,
      status: "warn",
      detail: `turbo.json could not be parsed: ${turbo.parseError}`,
    };
  }
  if (turbo.globalPassThroughAll) {
    return {
      id,
      label,
      status: "pass",
      detail: 'globalPassThroughEnv includes "*"',
    };
  }
  if (turbo.filteringTasks.length === 0) {
    return {
      id,
      label,
      status: "pass",
      detail: `envMode ${turbo.envMode}, every task declares env or passThroughEnv`,
    };
  }
  return {
    id,
    label,
    status: "warn",
    detail: `envMode ${turbo.envMode} filters injected variables out of ${turbo.filteringTasks.length} ${turbo.filteringTasks.length === 1 ? "task" : "tasks"}: ${turbo.filteringTasks.join(", ")}`,
    fix: 'add "passThroughEnv": ["*"] to those tasks (non-cached tasks only, or the cache key stops being honest); `envpilot heal` already works around this at run time',
  };
}

function composeCheck(scan: DeliveryScan): CheckResult {
  const id = "delivery.docker-compose";
  const label = "Compose services receive the environment";
  const { compose } = scan;

  if (compose.files.length === 0) return skip(id, label, "no compose file");
  if (compose.servicesWithoutEnv.length === 0) {
    return {
      id,
      label,
      status: "pass",
      detail: `${compose.files.join(", ")}: every service declares env_file or environment`,
    };
  }
  return {
    id,
    label,
    status: "warn",
    detail: `${compose.servicesWithoutEnv.length} ${compose.servicesWithoutEnv.length === 1 ? "service declares" : "services declare"} neither env_file nor environment: ${compose.servicesWithoutEnv.map((s) => `${s.file}:${s.service}`).join(", ")}`,
    fix: "add `environment:` entries (or `env_file:`) so the container sees the injected values",
  };
}

function wrapperCheck(scan: DeliveryScan): CheckResult {
  const id = "delivery.wrappers";
  const label = "Scripts do not rebuild the environment";
  if (scan.wrappers.length === 0) {
    return { id, label, status: "pass" };
  }
  const shown = scan.wrappers
    .slice(0, 6)
    .map((hit) => `${hit.source}:${hit.name} (${hit.wrappers.join(", ")})`);
  const rest = scan.wrappers.length - shown.length;
  return {
    id,
    label,
    status: "warn",
    detail: `${scan.wrappers.length} ${scan.wrappers.length === 1 ? "script wraps" : "scripts wrap"} another environment: ${shown.join("; ")}${rest > 0 ? `, +${rest} more` : ""}`,
    fix: "these commands build the child environment themselves, so injected values stop there unless the wrapper forwards them",
  };
}

function shadowCheck(scan: DeliveryScan): CheckResult {
  const id = "delivery.env-shadow";
  const label = "No local .env shadows injected keys";
  if (scan.shadows.length === 0) {
    return { id, label, status: "pass" };
  }

  const overlapping = scan.shadows.filter(
    (file) => file.overlapping.length > 0
  );
  if (overlapping.length === 0) {
    return {
      id,
      label,
      status: "warn",
      detail: `local env files present: ${scan.shadows.map((f) => `${f.file} (${f.keys.length} keys)`).join(", ")}. Overlap unknown without a resolved secret set.`,
      fix: "sign in and re-run doctor to see which keys collide",
    };
  }
  return {
    id,
    label,
    status: "warn",
    detail: overlapping
      .map((f) => `${f.file} redefines ${f.overlapping.join(", ")}`)
      .join("; "),
    fix: "a loader like dotenv reads these AFTER injection and wins; delete the local copies or stop loading them",
  };
}

// ── Group 6: Hygiene ────────────────────────────────────────────────────────

function hygieneGroup(
  root: string,
  options: DoctorOptions,
  fixesApplied: string[]
): CheckGroup {
  return {
    title: "Hygiene",
    results: [
      trackedEnvCheck(root),
      envIgnoredCheck(root, options, fixesApplied),
      ...cachePermissionChecks(options, fixesApplied),
    ],
  };
}

function trackedEnvCheck(root: string): CheckResult {
  const id = "hygiene.tracked-env";
  const label = "No .env tracked by git";
  if (!isGitRepo(root)) return skip(id, label, "not a git repository");
  // .env.example and friends are SUPPOSED to be committed. Reporting them as
  // leaked secrets, complete with "rotate every value", is a false positive
  // loud enough to discredit every other line of this report.
  const tracked = getTrackedEnvFiles(root).filter((f) => !isEnvTemplate(f));
  if (tracked.length === 0) return { id, label, status: "pass" };
  return {
    id,
    label,
    status: "fail",
    detail: `${tracked.length} env ${tracked.length === 1 ? "file is" : "files are"} committed: ${tracked.join(", ")}`,
    fix: `git rm --cached ${tracked.join(" ")} && rotate every value in them`,
  };
}

function envIgnoredCheck(
  root: string,
  options: DoctorOptions,
  fixesApplied: string[]
): CheckResult {
  const id = "hygiene.gitignore-env";
  const label = ".env ignored by git";
  if (!isGitRepo(root)) return skip(id, label, "not a git repository");
  if (gitignoreHas(root, ".env")) return { id, label, status: "pass" };

  if (options.fix) {
    ensureEnvInGitignore(root);
    if (gitignoreHas(root, ".env")) {
      fixesApplied.push(`added .env to ${join(root, ".gitignore")}`);
      return { id, label, status: "pass", detail: "added by --fix" };
    }
  }
  return {
    id,
    label,
    status: "warn",
    detail: `.gitignore in ${root} does not list .env`,
    fix: "envpilot doctor --fix",
  };
}

/**
 * The run cache holds DECRYPTED values, so its directory mode is a real
 * security boundary rather than tidiness.
 */
function cachePermissionChecks(
  options: DoctorOptions,
  fixesApplied: string[]
): CheckResult[] {
  const stats = getCacheStats();
  return [
    cachePermissionCheck(stats.dir, options, fixesApplied),
    {
      id: "hygiene.cache-entries",
      label: "Run cache size",
      status: "pass",
      detail: `${stats.count} ${stats.count === 1 ? "entry" : "entries"}, ${Math.round(stats.sizeBytes / 1024)} KB in ${stats.dir}`,
    },
  ];
}

function cachePermissionCheck(
  dir: string,
  options: DoctorOptions,
  fixesApplied: string[]
): CheckResult {
  const id = "hygiene.cache-permissions";
  const label = "Run cache is owner-only";
  if (!existsSync(dir)) return skip(id, label, "no cache directory yet");

  const mode = (): number => statSync(dir).mode & 0o777;
  try {
    if (mode() === 0o700) return { id, label, status: "pass", detail: dir };
    if (options.fix) {
      chmodSync(dir, 0o700);
      if (mode() === 0o700) {
        fixesApplied.push(`set ${dir} to 0700`);
        return {
          id,
          label,
          status: "pass",
          detail: "tightened to 0700 by --fix",
        };
      }
    }
    return {
      id,
      label,
      status: "warn",
      detail: `${dir} is ${mode().toString(8).padStart(3, "0")}, expected 700; it holds decrypted values`,
      fix: "envpilot doctor --fix",
    };
  } catch (err) {
    return {
      id,
      label,
      status: "warn",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function skip(id: string, label: string, reason: string): CheckResult {
  return { id, label, status: "skip", detail: reason };
}

function gitignoreHas(directory: string, entry: string): boolean {
  const path = join(directory, ".gitignore");
  if (!existsSync(path)) return false;
  try {
    return readFileSync(path, "utf-8")
      .split("\n")
      .some((line) => line.trim() === entry);
  } catch {
    return false;
  }
}

function summarize(groups: CheckGroup[]): DoctorSummary {
  const summary: DoctorSummary = {
    failed: 0,
    warnings: 0,
    passed: 0,
    skipped: 0,
  };
  for (const group of groups) {
    for (const result of group.results) {
      switch (result.status) {
        case "fail":
          summary.failed++;
          break;
        case "warn":
          summary.warnings++;
          break;
        case "pass":
          summary.passed++;
          break;
        case "skip":
          summary.skipped++;
          break;
      }
    }
  }
  return summary;
}
