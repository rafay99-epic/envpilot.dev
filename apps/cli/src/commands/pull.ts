import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import {
  success,
  error,
  info,
  warning,
  withSpinner,
  diff as showDiff,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import {
  applyMode,
  ignoreSecretFilePaths,
  modeMatches,
  statusOf,
  writeSecretFile,
} from "../lib/secret-files.js";
import { isAuthenticated } from "../lib/config.js";
import {
  readProjectConfig,
  readProjectConfigV2,
  resolveProject,
  getActiveProject,
  getTrackedEnvFiles,
} from "../lib/project-config.js";
import {
  readEnvFile,
  writeEnvFile,
  getEnvPathForEnvironment,
  diffEnvVars,
  applyFileProtection,
} from "../lib/env-file.js";
import {
  serialize,
  getDefaultFilename,
  ALL_FORMATS,
  type FormatType,
} from "../lib/format-converter.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
} from "../lib/errors.js";
import {
  normalizeOrgRole,
  formatRoleLabel,
  isFileWritable,
  type ProjectAccess,
} from "../lib/roles.js";
import type { Variable, ProjectEntry, VariablesMeta } from "../types/index.js";

/** How a project's pulled .env permissions are managed. */
type FileProtection = "auto" | "always" | "never";

/**
 * The /api/cli/variables meta block, including the legacy role/projectRole
 * fields the server still returns (passthrough keys not surfaced by the typed
 * VariablesMeta schema).
 */
type CliVariablesMeta = VariablesMeta & {
  role?: string | null;
  projectRole?: string | null;
};

/**
 * Build a ProjectAccess for THIS request from the /api/cli/variables meta.
 * Deriving from the per-request meta (not a stale global role) is what fixes
 * the cross-org bug where an owner-in-org-A value made a read-only developer's
 * file writable.
 */
function accessFromMeta(
  meta: CliVariablesMeta | undefined,
  variables: Variable[]
): ProjectAccess {
  const role = normalizeOrgRole(meta?.unifiedRole ?? meta?.role);
  return {
    role,
    // Owners are implicitly assigned to every project. The legacy server sends
    // no `assigned`/`projectRole` for owners, so fall back to true for them.
    assigned:
      role === "owner" ||
      (meta?.assigned ??
        (meta?.projectRole !== null && meta?.projectRole !== undefined)),
    environmentScope: meta?.environmentScope ?? null,
    hasWriteAccess:
      meta?.hasWriteAccess ?? variables.some((v) => v.access === "write"),
  };
}

export const pullCommand = new Command("pull")
  .description("Download environment variables to local .env file")
  .option(
    "-e, --env <environment>",
    "Environment (development, staging, production)"
  )
  .option("-f, --file <path>", "Output file path (default: .env)")
  .option("--force", "Overwrite without confirmation")
  .option(
    "--format <format>",
    "Output format: env, json, yaml, docker-compose, aws, vercel, netlify",
    "env"
  )
  .option(
    "--prefix <prefix>",
    "AWS Parameter Store path prefix (default: /project-name)"
  )
  .option("--dry-run", "Show what would be downloaded without writing")
  .option(
    "--files",
    "Also materialise secret files (keystores, SSH keys, certificates)"
  )
  .option("--project <name-or-id>", "Pull a specific linked project")
  .option("--all", "Pull all linked projects")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      // --all: pull every linked project
      if (options.all) {
        if (options.env || options.file) {
          error("Cannot use --env or --file with --all.");
          process.exit(1);
        }
        await pullAllProjects(options);
        return;
      }

      // --project: pull specific project
      if (options.project) {
        const configV2 = readProjectConfigV2();
        if (!configV2) throw notInitialized();

        const project = resolveProject(configV2, options.project);
        if (!project) {
          error(`Project not found: ${options.project}`);
          console.log();
          console.log("Linked projects:");
          for (const p of configV2.projects) {
            console.log(`  ${p.projectName || p.projectId} (${p.environment})`);
          }
          process.exit(1);
        }

        await pullSingleProject(project, options);
        return;
      }

      // Default: pull active project (V1 compat path)
      const projectConfig = readProjectConfig();
      if (!projectConfig) throw notInitialized();

      // Check for .env files tracked by git
      checkTrackedFiles();

      // Resolve the active V2 entry to honor its fileProtection preference.
      const configV2ForActive = readProjectConfigV2();
      const activeEntry = configV2ForActive
        ? getActiveProject(configV2ForActive)
        : null;

      const environment =
        options.env || projectConfig.environment || "development";
      const fmt = (options.format || "env") as FormatType;
      if (!ALL_FORMATS.includes(fmt)) {
        error(`Unknown format: ${fmt}. Supported: ${ALL_FORMATS.join(", ")}`);
        process.exit(1);
      }
      const outputPath =
        options.file ||
        (fmt === "env"
          ? getEnvPathForEnvironment(environment)
          : getDefaultFilename(fmt, environment));

      await pullProject(
        {
          projectId: projectConfig.projectId,
          organizationId: projectConfig.organizationId,
          environment,
          fileProtection: activeEntry?.fileProtection,
        },
        outputPath,
        options
      );
    } catch (err) {
      await handleError(err);
    }
  });

async function pullAllProjects(options: {
  force?: boolean;
  format?: string;
  dryRun?: boolean;
  files?: boolean;
}): Promise<void> {
  const configV2 = readProjectConfigV2();
  if (!configV2) throw notInitialized();

  checkTrackedFiles();

  let totalPulled = 0;
  let totalFailed = 0;

  for (const project of configV2.projects) {
    const outputPath = getEnvPathForEnvironment(project.environment);
    const displayName = project.projectName || project.projectId;

    console.log();
    console.log(
      chalk.bold(
        `Pulling "${displayName}" (${project.environment}) → ${outputPath}`
      )
    );

    try {
      await pullProject(
        {
          projectId: project.projectId,
          organizationId: project.organizationId,
          environment: project.environment,
          fileProtection: project.fileProtection,
        },
        outputPath,
        options
      );
      totalPulled++;
    } catch (err) {
      totalFailed++;
      if (err instanceof Error) {
        error(`  Failed: ${err.message}`);
      }
    }
  }

  console.log();
  if (totalFailed === 0) {
    success(`Pulled ${totalPulled} project${totalPulled !== 1 ? "s" : ""}`);
  } else {
    warning(
      `Pulled ${totalPulled}/${totalPulled + totalFailed} projects. ${totalFailed} failed.`
    );
  }
}

async function pullSingleProject(
  project: ProjectEntry,
  options: {
    env?: string;
    file?: string;
    force?: boolean;
    format?: string;
    prefix?: string;
    dryRun?: boolean;
    files?: boolean;
  }
): Promise<void> {
  checkTrackedFiles();

  const environment = options.env || project.environment;
  const fmt = (options.format || "env") as FormatType;
  const outputPath =
    options.file ||
    (fmt === "env"
      ? getEnvPathForEnvironment(environment)
      : getDefaultFilename(fmt, environment));

  await pullProject(
    {
      projectId: project.projectId,
      organizationId: project.organizationId,
      environment,
      fileProtection: project.fileProtection,
    },
    outputPath,
    options
  );
}

/**
 * Materialise a project's secret files alongside the .env.
 *
 * Deliberately additive and opt-in: `pull` has always produced exactly one
 * file, and silently scattering keystores through someone's tree would be a
 * surprising change of contract. The work itself is the same as
 * `envpilot files pull`.
 */
async function pullSecretFiles(
  projectId: string,
  environment: string,
  force?: boolean,
  dryRun?: boolean
): Promise<boolean> {
  const client = createAPIClient();
  const files = await client.listSecretFiles(projectId, environment);
  if (files.length === 0) return true;

  const root = process.cwd();

  // --dry-run still previews WHICH files would be written and their current
  // drift, it just never downloads content or touches the disk.
  if (dryRun) {
    console.log();
    info(`${files.length} secret file(s) for ${environment}:`);
    for (const file of files) {
      const status = await statusOf(file, root);
      // Permission drift is drift: a real pull chmods a byte-identical file
      // whose mode was loosened, so a preview that calls it "in-sync" is
      // lying about what the pull will do.
      const label =
        status === "in-sync" && !modeMatches(root, file.path, file.mode)
          ? "wrong-mode"
          : status;
      console.log(`    ${label.padEnd(10)} ${file.path}`);
    }
    return true;
  }

  const conflicts: typeof files = [];
  for (const file of files) {
    if ((await statusOf(file, root)) === "modified") conflicts.push(file);
  }
  if (conflicts.length > 0 && !force) {
    console.log();
    warning(
      "Secret files skipped — these local copies differ from the server:"
    );
    for (const file of conflicts) console.log(`    ${file.path}`);
    info("Re-run with --force to replace them.");
    // FAILURE, not a warning. Reporting success here made `pull --all` count
    // the project as pulled while its keystores were never written — the
    // build then fails somewhere far less obvious.
    return false;
  }

  // .gitignore before the write, never after.
  ignoreSecretFilePaths(
    root,
    files.map((f) => f.path)
  );

  console.log();
  let written = 0;
  for (const file of files) {
    if ((await statusOf(file, root)) === "in-sync") {
      // Repair loosened permissions without re-downloading anything.
      if (!modeMatches(root, file.path, file.mode)) {
        applyMode(root, file.path, file.mode);
      }
      continue;
    }
    const content = await client.getSecretFileContent(file._id);
    await writeSecretFile(
      root,
      content.path,
      Buffer.from(content.content, "base64"),
      content.mode
    );
    written += 1;
    console.log(`  ${chalk.green("✓")} ${file.path}  ${file.mode}`);
  }
  success(
    `${written} secret file${written === 1 ? "" : "s"} written, ${files.length - written} unchanged`
  );
  return true;
}

/**
 * Pull a project's variables and, when asked, its secret files.
 *
 * Every caller routes through here — the default path, --project, and --all —
 * so `--files` cannot be silently dropped by one of them. The variables pull
 * returns early when a project has none; files still run after it, because a
 * project can legitimately have secret files and no variables.
 */
async function pullProject(
  project: {
    projectId: string;
    organizationId: string;
    environment: string;
    fileProtection?: FileProtection;
  },
  outputPath: string,
  options: {
    env?: string;
    file?: string;
    force?: boolean;
    format?: string;
    prefix?: string;
    dryRun?: boolean;
    files?: boolean;
  }
): Promise<void> {
  await pullProjectVariables(project, outputPath, options);

  if (options.files) {
    const ok = await pullSecretFiles(
      project.projectId,
      project.environment,
      options.force,
      options.dryRun
    );
    if (!ok) {
      // Propagate: `pull --all` must not count this project as pulled, and a
      // single-project pull must exit nonzero so CI notices.
      throw new Error(
        "Secret files were not written — local copies differ from the server. Re-run with --force."
      );
    }
  }
}

async function pullProjectVariables(
  project: {
    projectId: string;
    organizationId: string;
    environment: string;
    fileProtection?: FileProtection;
  },
  outputPath: string,
  options: {
    force?: boolean;
    format?: string;
    prefix?: string;
    dryRun?: boolean;
  }
): Promise<void> {
  const api = createAPIClient();

  let meta: CliVariablesMeta | undefined;

  const variables = await withSpinner(
    `Fetching ${chalk.bold(project.environment)} variables...`,
    async () => {
      const response = await api.listVariables(
        project.projectId,
        project.environment,
        project.organizationId
      );
      meta = response.meta;
      return response.variables;
    }
  );

  // Environment-scope notice for scoped developers (server withholds vars
  // outside the developer's assigned environments).
  if (meta?.scopeRestricted && meta.environmentScope?.length) {
    info(
      `Your access is scoped to ${meta.environmentScope.join(", ")}; variables in other environments are withheld.`
    );
  }

  if (variables.length === 0) {
    warning(`No variables found for ${project.environment} environment.`);
    return;
  }

  const remoteVars: Record<string, string> = {};
  for (const variable of variables) {
    remoteVars[variable.key] = variable.value;
  }

  const localVars = readEnvFile(outputPath) || {};

  const diffResult = diffEnvVars(remoteVars, localVars);
  const hasChanges =
    Object.keys(diffResult.added).length > 0 ||
    Object.keys(diffResult.removed).length > 0 ||
    Object.keys(diffResult.changed).length > 0;

  if (!hasChanges) {
    success("Local file is up to date.");
    return;
  }

  console.log();
  console.log(chalk.bold("Changes:"));
  console.log();
  showDiff(diffResult.added, diffResult.removed, diffResult.changed);
  console.log();

  if (options.dryRun) {
    info("Dry run - no changes written.");
    return;
  }

  if (!options.force && Object.keys(localVars).length > 0) {
    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: `Overwrite ${outputPath}?`,
        default: true,
      },
    ]);

    if (!proceed) {
      info("Pull cancelled.");
      return;
    }
  }

  // Make file writable before writing (may be read-only from previous pull)
  try {
    const fs = await import("node:fs");
    if (fs.existsSync(outputPath)) {
      fs.chmodSync(outputPath, 0o644);
    }
  } catch {
    // Ignore — file may not exist yet
  }

  const fmt = (options.format || "env") as FormatType;
  if (fmt === "env") {
    const comments: Record<string, string> = {};
    for (const variable of variables) {
      if (variable.description) {
        comments[variable.key] = variable.description;
      }
    }
    writeEnvFile(outputPath, remoteVars, { sort: true, comments });
  } else {
    const fs = await import("node:fs");
    const output = serialize(remoteVars, fmt, {
      projectName: project.projectId,
      environment: project.environment,
      prefix: options.prefix,
    });
    fs.writeFileSync(outputPath, output, "utf-8");
  }

  // Apply access-based file protection derived from THIS request's meta (never
  // a stale global role), honoring the project's fileProtection preference.
  const access = accessFromMeta(meta, variables);
  const protection = project.fileProtection ?? "auto";
  applyFileProtection(outputPath, access, protection);

  success(
    `Downloaded ${variables.length} variables to ${chalk.bold(outputPath)}`
  );

  // Grant-only users only see variables explicitly shared with them.
  if (meta?.grantOnly) {
    info(
      "You have grant-only access to this project. You only see variables explicitly shared with you."
    );
  }

  // Show protection status.
  const writable =
    protection === "never" ||
    (protection !== "always" && isFileWritable(access));
  if (!writable) {
    info(
      `File is read-only (your role: ${formatRoleLabel(access.role)}${
        access.assigned ? "" : ", not assigned to this project"
      }).`
    );
  }

  console.log();
  console.log(chalk.dim(`  Added:   ${Object.keys(diffResult.added).length}`));
  console.log(
    chalk.dim(`  Changed: ${Object.keys(diffResult.changed).length}`)
  );
  console.log(
    chalk.dim(`  Removed: ${Object.keys(diffResult.removed).length}`)
  );
}

function checkTrackedFiles(): void {
  const trackedFiles = getTrackedEnvFiles();
  if (trackedFiles.length > 0) {
    error("Security risk: .env files are tracked by git!");
    console.log();
    for (const file of trackedFiles) {
      console.log(chalk.red(`  tracked: ${file}`));
    }
    console.log();
    console.log(
      chalk.yellow(
        "  Run the following to untrack them (without deleting the files):"
      )
    );
    for (const file of trackedFiles) {
      console.log(chalk.cyan(`    git rm --cached ${file}`));
    }
    console.log();
    process.exit(1);
  }
}
