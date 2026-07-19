import { Command } from "commander";
import inquirer from "inquirer";
import {
  error,
  header,
  info,
  success,
  table,
  warning,
  withSpinner,
} from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { isAuthenticated } from "../lib/config.js";
import { readProjectConfigV2, resolveProject } from "../lib/project-config.js";
import {
  notAuthenticated,
  notInitialized,
  handleError,
} from "../lib/errors.js";
import {
  formatRequestRows,
  formatRequestsListHeader,
} from "../lib/variable-requests.js";
import {
  variableRequestStatusSchema,
  type VariableRequestStatus,
} from "../types/index.js";

interface ListOptions {
  project?: string;
  status?: string;
  json?: boolean;
}

async function runList(options: ListOptions): Promise<void> {
  if (!isAuthenticated()) throw notAuthenticated();

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

  if (options.json) {
    console.log(JSON.stringify(requests, null, 2));
    return;
  }

  header(
    formatRequestsListHeader({
      projectName: project.projectName || project.projectId,
      organizationName: project.organizationName || project.organizationId,
    })
  );

  if (requests.length === 0) {
    info("No variable requests found.");
    return;
  }

  table(formatRequestRows(requests), [
    { key: "id", header: "ID" },
    { key: "key", header: "KEY" },
    { key: "environments", header: "ENVIRONMENTS" },
    { key: "status", header: "STATUS" },
    { key: "requested", header: "REQUESTED" },
    { key: "reason", header: "REASON" },
  ]);
}

const listSub = new Command("list")
  .description("List variable requests for a project")
  .option(
    "--project <name-or-id>",
    "List requests for a specific linked project"
  )
  .option("--status <status>", "Filter: pending, approved, rejected, canceled")
  .option("--json", "Output as JSON")
  .action(async (options: ListOptions) => {
    try {
      await runList(options);
    } catch (err) {
      await handleError(err);
    }
  });

const approveSub = new Command("approve")
  .description("Approve a pending request")
  .argument("<id>", "Request id (from `envpilot requests`)")
  .option(
    "--value <value>",
    "Secret value for a machine (valueless) request — CI only; interactively " +
      "you are prompted MASKED instead so the value stays out of shell history"
  )
  .option("--reason <text>", "Optional review note")
  .action(async (id: string, options: { value?: string; reason?: string }) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const api = createAPIClient();

      // A machine (valueless) request needs the reviewer to supply the
      // secret at approval. Detect that up front so interactive users get a
      // masked prompt instead of an error — and never put the secret in argv.
      const request = await withSpinner("Loading request...", () =>
        api.getVariableRequest(id)
      );
      if (!request) {
        error("Request not found (or you lack access to it).");
        process.exit(1);
      }
      if (request.status !== "pending") {
        error(
          `Only pending requests can be approved (current: ${request.status}).`
        );
        process.exit(1);
      }

      let value = options.value;
      if (request.vaultRef === undefined && value === undefined) {
        if (!process.stdin.isTTY) {
          error(
            `Request ${request.key} carries no value — non-interactive approval needs --value.`
          );
          process.exit(1);
        }
        warning(
          `${request.key} is a machine request with no value — you supply it now (encrypted server-side).`
        );
        const answer = await inquirer.prompt<{ value: string }>([
          {
            type: "password",
            name: "value",
            message: `Value for ${request.key}:`,
            mask: "*",
            validate: (input: string) =>
              input.length > 0 || "Value cannot be empty.",
          },
        ]);
        value = answer.value;
      }

      await withSpinner("Approving request...", () =>
        request.vaultRef === undefined && value !== undefined
          ? api.approveRequestWithValue(id, value, options.reason)
          : api.reviewRequest(id, "approve", options.reason)
      );
      success(`Request approved: ${request.key}.`);
    } catch (err) {
      await handleError(err);
    }
  });

const rejectSub = new Command("reject")
  .description("Reject a pending request")
  .argument("<id>", "Request id (from `envpilot requests`)")
  .option("--reason <text>", "Optional review note shown to the requester")
  .action(async (id: string, options: { reason?: string }) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const api = createAPIClient();
      await withSpinner("Rejecting request...", () =>
        api.reviewRequest(id, "reject", options.reason)
      );
      success("Request rejected.");
    } catch (err) {
      await handleError(err);
    }
  });

const cancelSub = new Command("cancel")
  .description("Cancel a pending request (your own, or as a reviewer)")
  .argument("<id>", "Request id (from `envpilot requests`)")
  .action(async (id: string) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const api = createAPIClient();
      await withSpinner("Canceling request...", () => api.cancelRequest(id));
      success("Request canceled.");
    } catch (err) {
      await handleError(err);
    }
  });

// `requests` bare = list (back-compat); subcommands add the review loop.
export const requestsCommand = new Command("requests")
  .description("List and review variable requests")
  .option(
    "--project <name-or-id>",
    "List requests for a specific linked project"
  )
  .option("--status <status>", "Filter: pending, approved, rejected, canceled")
  .option("--json", "Output as JSON")
  .action(async (options: ListOptions) => {
    try {
      await runList(options);
    } catch (err) {
      await handleError(err);
    }
  })
  .addCommand(listSub)
  .addCommand(approveSub)
  .addCommand(rejectSub)
  .addCommand(cancelSub);
