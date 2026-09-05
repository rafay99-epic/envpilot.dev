import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import { basename, isAbsolute } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  success,
  error,
  info,
  warning,
  withSpinner,
  blank,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import type { SecretFileRow } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import {
  readProjectConfigV2,
  resolveProject,
  getActiveProject,
} from "../lib/project-config.js";
import {
  applyMode,
  ignoreSecretFilePaths,
  modeMatches,
  statusOf,
  type FileStatus,
  writeSecretFile,
} from "../lib/secret-files.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
  isProtectedEnvironmentError,
  formatProtectedEnvironments,
} from "../lib/errors.js";

/**
 * `envpilot files` — secret files that are not strings.
 *
 * Keystores, SSH keys, service-account JSON. Each carries a destination path
 * and a POSIX mode, so a fresh clone can materialise everything the build
 * needs without anyone remembering where the keystore goes.
 *
 * `list` and `status` are METADATA ONLY: they never decrypt, never touch the
 * vault, and never write a download audit entry. Only `pull` and `get` fetch
 * content, one file per call, each audited.
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Resolve the active project for the cwd, or exit with the standard error. */
function requireProject(projectOption?: string): {
  projectId: string;
  projectName: string;
  environment: string;
} {
  const config = readProjectConfigV2();
  if (!config) throw notInitialized();

  const entry = projectOption
    ? resolveProject(config, projectOption)
    : getActiveProject(config);
  if (!entry) {
    throw new Error(
      projectOption
        ? `No linked project matches "${projectOption}".`
        : "No active project. Run `envpilot init` or `envpilot switch`."
    );
  }
  return {
    projectId: entry.projectId,
    projectName: entry.projectName,
    environment: entry.environment,
  };
}

/**
 * Which environment a command acts on.
 *
 * Commands that WRITE to disk or mutate must resolve to exactly one
 * environment. The same path may legitimately exist in several (a dev and a
 * prod google-services.json), so an unscoped `pull` would race two files onto
 * one path and an unscoped `rm` would silently pick whichever came back
 * first. Default to the linked environment, exactly like `envpilot pull`.
 */
function resolveEnvironment(
  option: string | undefined,
  linked: string
): string {
  return option ?? linked;
}

function printFileRow(file: SecretFileRow, status?: string): void {
  const marker =
    status === "in-sync"
      ? chalk.green("✓")
      : status === "modified" || status === "wrong-mode"
        ? chalk.yellow("!")
        : status === "missing"
          ? chalk.red("✗")
          : " ";
  const suffix =
    status === "modified"
      ? chalk.yellow("  local differs from remote")
      : status === "missing"
        ? chalk.red("  missing locally")
        : status === "wrong-mode"
          ? chalk.yellow("  wrong permissions")
          : "";
  console.log(
    `  ${marker} ${chalk.bold(file.path.padEnd(38))} ${formatBytes(file.size).padStart(9)}  ${file.mode}  ${chalk.dim(
      file.environments.join(",")
    )}${suffix}`
  );
}

const listCommand = new Command("list")
  .alias("ls")
  .description("List secret files (metadata only — nothing is decrypted)")
  .option("-e, --env <environment>", "Filter by environment")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId, projectName } = requireProject(options.project);

      const files = await withSpinner("Loading secret files...", () =>
        createAPIClient().listSecretFiles(projectId, options.env)
      );

      if (files.length === 0) {
        info(`No secret files in ${projectName}.`);
        info("Upload one with: envpilot files add <path>");
        return;
      }

      blank();
      console.log(chalk.bold(`Secret files in ${projectName}`));
      blank();
      for (const file of files) printFileRow(file);
      blank();
      info(`${files.length} file${files.length === 1 ? "" : "s"}`);
    } catch (err) {
      handleError(err);
    }
  });

const statusCommand = new Command("status")
  .description("Compare local copies against the server (no decryption)")
  .option("-e, --env <environment>", "Filter by environment")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId, projectName, environment } = requireProject(
        options.project
      );
      const env = resolveEnvironment(options.env, environment);

      const files = await withSpinner("Checking secret files...", () =>
        createAPIClient().listSecretFiles(projectId, env)
      );

      if (files.length === 0) {
        info(`No secret files in ${projectName} (${env}).`);
        return;
      }

      blank();
      const root = process.cwd();
      const fileStatuses = await Promise.all(
        files.map(async (file) => ({
          file,
          status: await statusOf(file, root),
        }))
      );
      let drifted = 0;
      for (const { file, status } of fileStatuses) {
        // Hash the LOCAL copy and compare — no network, no decrypt, no audit.
        // Content and permissions drift independently: a byte-identical file
        // left world-readable is still wrong for a keystore.
        const wrongMode =
          status === "in-sync" && !modeMatches(root, file.path, file.mode);
        if (status !== "in-sync" || wrongMode) drifted += 1;
        printFileRow(file, wrongMode ? "wrong-mode" : status);
      }
      blank();
      if (drifted === 0) {
        success("All secret files are in sync.");
      } else {
        warning(
          `${drifted} file${drifted === 1 ? "" : "s"} out of sync. Run: envpilot files pull`
        );
      }
    } catch (err) {
      handleError(err);
    }
  });

const pullCommand = new Command("pull")
  .description("Write secret files to their recorded paths")
  .option("-e, --env <environment>", "Filter by environment")
  .option("--force", "Overwrite local files that differ from the server")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId, projectName, environment } = requireProject(
        options.project
      );
      const env = resolveEnvironment(options.env, environment);
      const client = createAPIClient();

      const files = await withSpinner("Loading secret files...", () =>
        client.listSecretFiles(projectId, env)
      );
      if (files.length === 0) {
        info(`No secret files in ${projectName} (${env}).`);
        return;
      }

      const root = process.cwd();

      // Read each local file ONCE. statusOf hashes the file on disk, so
      // calling it in both the conflict filter and the write loop hashed
      // every keystore twice per pull.
      const statusEntries = await Promise.all(
        files.map(
          async (file): Promise<[string, FileStatus]> => [
            file._id,
            await statusOf(file, root),
          ]
        )
      );
      const statuses = new Map(statusEntries);

      // Refuse silently-destructive overwrites. A local keystore that differs
      // may be someone's debug copy; losing it without a word is worse than
      // making them pass --force.
      const conflicts = files.filter(
        (file) => statuses.get(file._id) === "modified"
      );
      if (conflicts.length > 0 && !options.force) {
        warning("These local files differ from the server:");
        for (const file of conflicts) console.log(`    ${file.path}`);
        blank();
        error("Refusing to overwrite. Re-run with --force to replace them.");
        process.exitCode = 1;
        return;
      }

      // .gitignore FIRST, so no window exists where a secret is on disk and
      // still offerable to git.
      const ignored = ignoreSecretFilePaths(
        root,
        files.map((f) => f.path)
      );
      if (ignored.length > 0) {
        success(`Added ${ignored.length} path(s) to .gitignore`);
      }

      blank();
      const repairedIds = new Set<string>();
      const filesToWrite: SecretFileRow[] = [];
      for (const file of files) {
        if (statuses.get(file._id) === "in-sync") {
          if (!modeMatches(root, file.path, file.mode)) {
            applyMode(root, file.path, file.mode);
            repairedIds.add(file._id);
          }
        } else {
          filesToWrite.push(file);
        }
      }

      const writtenIds = new Set(
        filesToWrite.length === 0
          ? []
          : await withSpinner(
              `Fetching ${filesToWrite.length} secret file${filesToWrite.length === 1 ? "" : "s"}...`,
              () =>
                Promise.all(
                  filesToWrite.map(async (file) => {
                    const content = await client.getSecretFileContent(file._id);
                    await writeSecretFile(
                      root,
                      content.path,
                      Buffer.from(content.content, "base64"),
                      content.mode
                    );
                    return file._id;
                  })
                )
            )
      );

      for (const file of files) {
        if (writtenIds.has(file._id)) {
          console.log(
            `  ${chalk.green("✓")} ${file.path}  ${formatBytes(file.size)}  ${file.mode}`
          );
        } else if (repairedIds.has(file._id)) {
          console.log(
            `  ${chalk.yellow("~")} ${file.path} ${chalk.dim(
              `(permissions restored to ${file.mode})`
            )}`
          );
        } else {
          console.log(
            `  ${chalk.dim("=")} ${file.path} ${chalk.dim("(unchanged)")}`
          );
        }
      }

      blank();
      const written = writtenIds.size;
      const repairedCount = repairedIds.size;
      success(
        `${written} file${written === 1 ? "" : "s"} written` +
          (repairedCount > 0
            ? `, ${repairedCount} permission${repairedCount === 1 ? "" : "s"} repaired`
            : "") +
          `, ${files.length - written - repairedCount} unchanged`
      );
    } catch (err) {
      handleError(err);
    }
  });

const addCommand = new Command("add")
  .description("Upload a local file as a secret file")
  .argument("<file>", "Path to the local file to upload")
  .option("--path <path>", "Destination path (default: the file's own path)")
  .option("-n, --name <name>", "Display name (default: the filename)")
  .option("-e, --env <environments>", "Comma-separated environments")
  .option("--mode <mode>", "File mode: 0600 (default) or 0400")
  .option("-d, --description <text>", "Optional description")
  .option("--project <name-or-id>", "Use a specific linked project")
  .option(
    "--request",
    "Propose the upload for approval instead of failing when the target environment is protected"
  )
  .action(async (localPath, options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId, projectName } = requireProject(options.project);

      if (!existsSync(localPath) || !statSync(localPath).isFile()) {
        error(`Not a file: ${localPath}`);
        process.exitCode = 1;
        return;
      }

      const environments: string[] = options.env
        ? String(options.env)
            .split(",")
            .map((e: string) => e.trim())
            .filter(Boolean)
        : (
            await inquirer.prompt<{ environments: string[] }>([
              {
                type: "checkbox",
                name: "environments",
                message: "Which environments should this file belong to?",
                choices: ["development", "staging", "production"],
                default: ["development"],
                validate: (input: readonly unknown[]) =>
                  input.length > 0 || "Pick at least one environment",
              },
            ])
          ).environments;

      if (environments.length === 0) {
        error("At least one environment is required.");
        process.exitCode = 1;
        return;
      }

      const contents = readFileSync(localPath);
      // Destination defaults to the local path made relative. An absolute
      // source ("envpilot files add /tmp/upload.jks") has no meaningful
      // in-project location, so fall back to the bare filename rather than
      // sending an absolute path the server will reject.
      const destination =
        options.path ??
        (isAbsolute(localPath)
          ? basename(localPath)
          : localPath.replace(/^\.\//, ""));
      const name = options.name ?? basename(localPath);

      let result:
        | { fileId: string; size: number; sha256: string }
        | { requested: true; requestId: string };
      try {
        result = await withSpinner(`Uploading ${name}...`, () =>
          createAPIClient().uploadSecretFile({
            projectId,
            name,
            path: destination,
            content: contents.toString("base64"),
            mode: options.mode,
            description: options.description,
            environments,
            request: options.request === true,
          })
        );
      } catch (err) {
        if (isProtectedEnvironmentError(err) && options.request !== true) {
          error(
            `${formatProtectedEnvironments(err.data.environments)}. Nothing was uploaded. Re-run with --request to propose this for approval.`
          );
          process.exitCode = 1;
          return;
        }
        throw err;
      }

      if ("requested" in result) {
        success(`Sent for approval (request ${result.requestId}).`);
        info("Waiting for a second person to approve.");
        return;
      }

      success(
        `Uploaded ${name} to ${projectName}  ${formatBytes(result.size)}  sha ${result.sha256.slice(0, 12)}…`
      );

      const ignored = ignoreSecretFilePaths(process.cwd(), [destination]);
      if (ignored.length > 0) {
        success(`Added ${destination} to .gitignore`);
      }
    } catch (err) {
      handleError(err);
    }
  });

const getCommand = new Command("get")
  .description("Write a single secret file to its recorded path")
  .argument("<path>", "The secret file's destination path")
  .option("-e, --env <environment>", "Filter by environment")
  .option("--force", "Overwrite a local file that differs from the server")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (targetPath, options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId, environment } = requireProject(options.project);
      const env = resolveEnvironment(options.env, environment);
      const client = createAPIClient();

      const files = await client.listSecretFiles(projectId, env);
      const matches = files.filter((f) => f.path === targetPath);
      if (matches.length === 0) {
        error(`No secret file at "${targetPath}" in ${env}.`);
        info("Run `envpilot files list` to see what is available.");
        process.exitCode = 1;
        return;
      }
      if (matches.length > 1) {
        error(`"${targetPath}" matches ${matches.length} files in ${env}.`);
        info("Narrow it down with --env.");
        process.exitCode = 1;
        return;
      }
      const match = matches[0];

      // Same preflight `files pull` runs. `get` writes to exactly the same
      // place with the same consequences, so it cannot be the one command
      // that silently clobbers a local keystore or leaves a secret
      // untracked-and-offerable to git.
      const root = process.cwd();
      if ((await statusOf(match, root)) === "modified" && !options.force) {
        error(`Local ${match.path} differs from the server.`);
        info("Re-run with --force to replace it.");
        process.exitCode = 1;
        return;
      }

      const ignored = ignoreSecretFilePaths(root, [match.path]);
      if (ignored.length > 0) {
        success(`Added ${match.path} to .gitignore`);
      }

      const content = await withSpinner(`Fetching ${match.path}...`, () =>
        client.getSecretFileContent(match._id)
      );
      await writeSecretFile(
        root,
        content.path,
        Buffer.from(content.content, "base64"),
        content.mode
      );
      success(`Wrote ${content.path} (${content.mode})`);
    } catch (err) {
      handleError(err);
    }
  });

const rmCommand = new Command("rm")
  .description("Move a secret file to the trash")
  .argument("<path>", "The secret file's destination path")
  .option(
    "-e, --env <environment>",
    "Environment to remove the file from (defaults to the linked one). If the file also belongs to other environments, only this one is detached."
  )
  .option(
    "--all-envs",
    "Trash the file for every environment it belongs to, not just --env"
  )
  .option("-y, --yes", "Skip the confirmation prompt")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (targetPath, options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId, environment } = requireProject(options.project);
      const env = resolveEnvironment(options.env, environment);
      const client = createAPIClient();

      const files = await client.listSecretFiles(projectId, env);
      const matches = files.filter((f) => f.path === targetPath);
      if (matches.length === 0) {
        error(`No secret file at "${targetPath}" in ${env}.`);
        process.exitCode = 1;
        return;
      }
      if (matches.length > 1) {
        error(`"${targetPath}" matches ${matches.length} files in ${env}.`);
        info("Narrow it down with --env.");
        process.exitCode = 1;
        return;
      }
      const match = matches[0];

      // A file shared across environments is ONE row, so trashing it removes
      // production's copy too. Detaching just the named environment is what
      // "remove it from staging" actually means; full deletion needs
      // --all-envs (or is implied when this is the only environment left).
      const detachOnly =
        !options.allEnvs &&
        match.environments.length > 1 &&
        match.environments.includes(env);
      const remaining = match.environments.filter((e) => e !== env);

      if (!options.yes) {
        const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
          {
            type: "confirm",
            name: "confirmed",
            message: detachOnly
              ? `Remove "${match.name}" (${match.path}) from ${env}? It stays in ${remaining.join(", ")}.`
              : match.environments.length > 1
                ? `"${match.name}" (${match.path}) belongs to ${match.environments.join(", ")}. Deleting trashes it for ALL of them — continue?`
                : `Move "${match.name}" (${match.path}, ${env}) to trash?`,
            default: false,
          },
        ]);
        if (!confirmed) {
          info("Cancelled.");
          return;
        }
      }

      try {
        if (detachOnly) {
          // The server derives the surviving set itself — sending a computed
          // array would overwrite an environment change another user made
          // between the listing above and this call.
          const result = await withSpinner(`Removing from ${env}...`, () =>
            client.detachSecretFileEnvironment(match._id, env)
          );
          success(
            `${match.name} removed from ${env}. Still in ${result.remaining.join(", ")}.`
          );
          return;
        }
      } catch (err) {
        if (!isProtectedEnvironmentError(err)) throw err;

        const prompt = `${formatProtectedEnvironments(err.data.environments)}. File a change request to remove it from ${env}?`;
        if (!options.yes) {
          if (!process.stdin.isTTY) {
            error(prompt);
            info("Re-run with --yes to file a change request.");
            process.exitCode = 1;
            return;
          }
          const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
            {
              type: "confirm",
              name: "proceed",
              message: prompt,
              default: true,
            },
          ]);
          if (!proceed) {
            info("Nothing changed.");
            return;
          }
        }

        const { requestId } = await withSpinner(
          "Filing change request...",
          () =>
            client.createChangeRequest({
              projectId,
              resourceType: "file",
              kind: "update",
              targetId: match._id,
              environments: match.environments,
              payload: { environments: remaining },
              label: match.name,
            })
        );
        success(`Sent for approval (request ${requestId}).`);
        info("Waiting for a second person to approve.");
        return;
      }

      try {
        await withSpinner("Deleting...", () =>
          client.removeSecretFile(match._id)
        );
        success(`Moved ${match.name} to trash. Restore it from the dashboard.`);
      } catch (err) {
        if (!isProtectedEnvironmentError(err)) throw err;

        const prompt = `${formatProtectedEnvironments(err.data.environments)}. File a change request to delete it?`;
        if (!options.yes) {
          if (!process.stdin.isTTY) {
            error(prompt);
            info("Re-run with --yes to file a change request.");
            process.exitCode = 1;
            return;
          }
          const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
            {
              type: "confirm",
              name: "proceed",
              message: prompt,
              default: true,
            },
          ]);
          if (!proceed) {
            info("Nothing deleted.");
            return;
          }
        }

        const { requestId } = await withSpinner(
          "Filing change request...",
          () =>
            client.createChangeRequest({
              projectId,
              resourceType: "file",
              kind: "delete",
              targetId: match._id,
              environments: match.environments,
              payload: {},
              label: match.name,
            })
        );
        success(`Sent for approval (request ${requestId}).`);
        info("Waiting for a second person to approve.");
      }
    } catch (err) {
      handleError(err);
    }
  });

export const filesCommand = new Command("files")
  .description("Manage secret files (keystores, SSH keys, certificates)")
  .addCommand(listCommand)
  .addCommand(statusCommand)
  .addCommand(pullCommand)
  .addCommand(addCommand)
  .addCommand(getCommand)
  .addCommand(rmCommand);
