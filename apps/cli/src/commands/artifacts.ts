import { Command } from "commander";
import chalk from "chalk";
import { isAuthenticated } from "../lib/config.js";
import {
  getActiveProject,
  readProjectConfigV2,
  resolveProject,
} from "../lib/project-config.js";
import { listArtifacts, pullArtifact } from "../lib/artifacts.js";
import {
  handleError,
  notAuthenticated,
  notInitialized,
} from "../lib/errors.js";

function resolveLinkedProject(identifier?: string) {
  const config = readProjectConfigV2();
  if (!config) throw notInitialized();
  const project = identifier
    ? resolveProject(config, identifier)
    : getActiveProject(config);
  if (!project) {
    throw new Error(
      `Linked project not found${identifier ? `: ${identifier}` : ""}`
    );
  }
  return project;
}

export const artifactsCommand = new Command("artifacts").description(
  "List and securely pull project build artifacts"
);

artifactsCommand
  .command("list")
  .description("List secure artifacts for a linked project")
  .option("--project <name-or-id>", "Use a specific linked project")
  .action(async (options: { project?: string }) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const project = resolveLinkedProject(options.project);
      const artifacts = await listArtifacts(project.projectId);
      if (artifacts.length === 0) {
        console.log("No secure artifacts found.");
        return;
      }
      for (const artifact of artifacts) {
        console.log(
          `${chalk.bold(artifact.name)}  ${artifact.fileName}  v${artifact.currentVersion}`
        );
      }
    } catch (error) {
      await handleError(error);
    }
  });

artifactsCommand
  .command("pull")
  .description("Download, verify, and decrypt secure artifacts locally")
  .option("--project <name-or-id>", "Use a specific linked project")
  .option("--name <name...>", "Pull only matching artifact names or filenames")
  .option(
    "--dir <path>",
    "Destination directory (files are written with mode 0600)",
    ".envpilot-artifacts"
  )
  .action(
    async (options: { project?: string; name?: string[]; dir: string }) => {
      try {
        if (!isAuthenticated()) throw notAuthenticated();
        const project = resolveLinkedProject(options.project);
        const artifacts = await listArtifacts(project.projectId);
        const requested = options.name ? new Set(options.name) : null;
        const selected = requested
          ? artifacts.filter(
              (artifact) =>
                requested.has(artifact.name) || requested.has(artifact.fileName)
            )
          : artifacts;
        if (requested) {
          const found = new Set(
            selected.flatMap((artifact) => [artifact.name, artifact.fileName])
          );
          const missing = [...requested].filter((name) => !found.has(name));
          if (missing.length > 0) {
            throw new Error(`Artifact not found: ${missing.join(", ")}`);
          }
        }
        for (const artifact of selected) {
          const outputPath = await pullArtifact(artifact._id, options.dir);
          console.log(`${chalk.green("✓")} ${artifact.name} → ${outputPath}`);
        }
        console.log(
          chalk.green(
            `Pulled ${selected.length} encrypted artifact${selected.length === 1 ? "" : "s"}`
          )
        );
      } catch (error) {
        await handleError(error);
      }
    }
  );
