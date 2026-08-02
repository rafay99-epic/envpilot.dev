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
  ignoreSecretFilePaths,
  statusOf,
  writeSecretFile,
} from "../lib/secret-files.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
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
  return { projectId: entry.projectId, projectName: entry.projectName };
}

function printFileRow(file: SecretFileRow, status?: string): void {
  const marker =
    status === "in-sync"
      ? chalk.green("✓")
      : status === "modified"
        ? chalk.yellow("!")
        : status === "missing"
          ? chalk.red("✗")
          : " ";
  const suffix =
    status === "modified"
      ? chalk.yellow("  local differs from remote")
      : status === "missing"
        ? chalk.red("  missing locally")
        : "";
  console.log(
    `  ${marker} ${chalk.bold(file.path.padEnd(38))} ${formatBytes(file.size).padStart(9)}  ${file.mode}${suffix}`
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
      const { projectId, projectName } = requireProject(options.project);

      const files = await withSpinner("Checking secret files...", () =>
        createAPIClient().listSecretFiles(projectId, options.env)
      );

      if (files.length === 0) {
        info(`No secret files in ${projectName}.`);
        return;
      }

      blank();
      let drifted = 0;
      for (const file of files) {
        // Hash the LOCAL copy and compare — no network, no decrypt, no audit.
        const status = statusOf(file, process.cwd());
        if (status !== "in-sync") drifted += 1;
        printFileRow(file, status);
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
      const { projectId, projectName } = requireProject(options.project);
      const client = createAPIClient();

      const files = await withSpinner("Loading secret files...", () =>
        client.listSecretFiles(projectId, options.env)
      );
      if (files.length === 0) {
        info(`No secret files in ${projectName}.`);
        return;
      }

      const root = process.cwd();

      // Read each local file ONCE. statusOf hashes the file on disk, so
      // calling it in both the conflict filter and the write loop hashed
      // every keystore twice per pull.
      const statuses = new Map(files.map((f) => [f._id, statusOf(f, root)]));

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
      let written = 0;
      for (const file of files) {
        if (statuses.get(file._id) === "in-sync") {
          console.log(
            `  ${chalk.dim("=")} ${file.path} ${chalk.dim("(unchanged)")}`
          );
          continue;
        }
        // One decrypt per file, each audited server-side.
        const content = await withSpinner(`Fetching ${file.path}...`, () =>
          client.getSecretFileContent(file._id)
        );
        writeSecretFile(
          root,
          content.path,
          Buffer.from(content.content, "base64"),
          content.mode
        );
        written += 1;
        console.log(
          `  ${chalk.green("✓")} ${file.path}  ${formatBytes(file.size)}  ${file.mode}`
        );
      }

      blank();
      success(
        `${written} file${written === 1 ? "" : "s"} written, ${files.length - written} unchanged`
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

      const result = await withSpinner(`Uploading ${name}...`, () =>
        createAPIClient().uploadSecretFile({
          projectId,
          name,
          path: destination,
          content: contents.toString("base64"),
          mode: options.mode,
          description: options.description,
          environments,
        })
      );

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
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (targetPath, options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId } = requireProject(options.project);
      const client = createAPIClient();

      const files = await client.listSecretFiles(projectId, options.env);
      const match = files.find((f) => f.path === targetPath);
      if (!match) {
        error(`No secret file at "${targetPath}".`);
        info("Run `envpilot files list` to see what is available.");
        process.exitCode = 1;
        return;
      }

      const content = await withSpinner(`Fetching ${match.path}...`, () =>
        client.getSecretFileContent(match._id)
      );
      writeSecretFile(
        process.cwd(),
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
  .option("-y, --yes", "Skip the confirmation prompt")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (targetPath, options) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const { projectId } = requireProject(options.project);
      const client = createAPIClient();

      const files = await client.listSecretFiles(projectId);
      const match = files.find((f) => f.path === targetPath);
      if (!match) {
        error(`No secret file at "${targetPath}".`);
        process.exitCode = 1;
        return;
      }

      if (!options.yes) {
        const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
          {
            type: "confirm",
            name: "confirmed",
            message: `Move "${match.name}" (${match.path}) to trash?`,
            default: false,
          },
        ]);
        if (!confirmed) {
          info("Cancelled.");
          return;
        }
      }

      await withSpinner("Deleting...", () =>
        client.removeSecretFile(match._id)
      );
      success(`Moved ${match.name} to trash. Restore it from the dashboard.`);
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
