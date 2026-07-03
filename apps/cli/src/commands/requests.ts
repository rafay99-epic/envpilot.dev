import { Command } from "commander";
import { error, info, table, withSpinner } from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import { readProjectConfigV2, resolveProject } from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
} from "../lib/errors.js";
import { formatRequestRows } from "../lib/variable-requests.js";
import {
  variableRequestStatusSchema,
  type VariableRequestStatus,
} from "../types/index.js";

export const requestsCommand = new Command("requests")
  .description("List variable requests for a project")
  .option(
    "--project <name-or-id>",
    "List requests for a specific linked project"
  )
  .option(
    "--status <status>",
    "Filter by status: pending, approved, rejected, canceled"
  )
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

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

      let status: VariableRequestStatus | undefined;
      if (options.status) {
        const parsed = variableRequestStatusSchema.safeParse(options.status);
        if (!parsed.success) {
          error(
            `Invalid status: ${options.status}. Must be one of pending, approved, rejected, canceled.`
          );
          process.exit(1);
        }
        status = parsed.data;
      }

      const api = createAPIClient();
      const requests = await withSpinner("Fetching variable requests...", () =>
        api.listVariableRequests(project.projectId, status)
      );

      if (requests.length === 0) {
        info("No variable requests found.");
        return;
      }

      table(formatRequestRows(requests), [
        { key: "key", header: "KEY" },
        { key: "environments", header: "ENVIRONMENTS" },
        { key: "status", header: "STATUS" },
        { key: "requested", header: "REQUESTED" },
        { key: "reason", header: "REASON" },
      ]);
    } catch (err) {
      await handleError(err);
    }
  });
