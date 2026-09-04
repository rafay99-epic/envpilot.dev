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
import { createAPIClient, type APIClient } from "../lib/api.js";
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
import type { ChangeRequestRow, ChangeRequestStatus } from "../lib/api.js";

/**
 * Row shape for the change-requests table under `envpilot requests`.
 * Change requests are the protected-environment proposal queue — a separate
 * table from ordinary variable requests, which route/scope has nothing to
 * do with protection.
 */
interface ChangeRequestDisplayRow {
  id: string;
  label: string;
  kind: string;
  environments: string;
  status: string;
  age: string;
  [key: string]: string | number | boolean | undefined;
}

function formatAge(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatChangeRequestRows(
  requests: ChangeRequestRow[]
): ChangeRequestDisplayRow[] {
  return requests.map((r) => ({
    id: r._id,
    label: r.label,
    kind: r.kind,
    environments: r.environments.join(", "),
    status: r.status,
    age: formatAge(r.createdAt),
  }));
}

/** Read all of stdin (for --value-stdin approvals in CI). */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

interface ListOptions {
  project?: string;
  status?: string;
  json?: boolean;
  changes?: boolean;
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

  // `--changes` swaps the listing to the change-request queue (protected-
  // environment proposals) instead of ordinary variable requests. Keeping
  // the two outputs separate — rather than combining them under `--json` —
  // preserves the pre-existing `--json` array shape for scripts.
  if (options.changes) {
    const changeStatus: ChangeRequestStatus | undefined =
      status === undefined
        ? undefined
        : status === "approved"
          ? "applied"
          : status;
    const changeRequests = await withSpinner(
      "Fetching change requests...",
      () => api.listChangeRequests(project.projectId, changeStatus)
    );

    if (options.json) {
      console.log(JSON.stringify(changeRequests, null, 2));
      return;
    }

    header(
      formatRequestsListHeader({
        projectName: project.projectName || project.projectId,
        organizationName: project.organizationName || project.organizationId,
      })
    );
    console.log();
    header("Change requests (protected environments)");
    if (changeRequests.length === 0) {
      info("No change requests found.");
      return;
    }
    table(formatChangeRequestRows(changeRequests), [
      { key: "id", header: "ID" },
      { key: "label", header: "LABEL" },
      { key: "kind", header: "KIND" },
      { key: "environments", header: "ENVIRONMENTS" },
      { key: "status", header: "STATUS" },
      { key: "age", header: "AGE" },
    ]);
    return;
  }

  const requests = await withSpinner("Fetching requests...", () =>
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
  } else {
    table(formatRequestRows(requests), [
      { key: "id", header: "ID" },
      { key: "key", header: "KEY" },
      { key: "environments", header: "ENVIRONMENTS" },
      { key: "status", header: "STATUS" },
      { key: "requested", header: "REQUESTED" },
      { key: "reason", header: "REASON" },
    ]);
  }
}

const listSub = new Command("list")
  .description("List variable requests for a project")
  .option(
    "--project <name-or-id>",
    "List requests for a specific linked project"
  )
  .option("--status <status>", "Filter: pending, approved, rejected, canceled")
  .option("--json", "Output as JSON")
  .option(
    "--changes",
    "List change requests (protected-environment proposals) instead of variable requests"
  )
  .action(async (options: ListOptions) => {
    try {
      await runList(options);
    } catch (err) {
      await handleError(err);
    }
  });

/** Pure lookup: which row in a change-request list (if any) matches `id`. */
export function findMatchingChangeRequest(
  rows: ChangeRequestRow[],
  id: string
): ChangeRequestRow | null {
  return rows.find((r) => r._id === id) ?? null;
}

/**
 * Look up `id` among the linked project's change requests (protected-
 * environment proposals) so approve/reject/cancel can route it to the
 * change-request endpoints instead of the ordinary variable-request ones.
 * Returns null (never throws) when no project is linked locally or the id
 * isn't a change request — the caller then falls back to the variable-
 * request flow, unchanged from before.
 */
async function findChangeRequest(
  api: APIClient,
  id: string,
  projectOption?: string
): Promise<ChangeRequestRow | null> {
  const configV2 = readProjectConfigV2();
  if (!configV2) return null;
  const project = resolveProject(configV2, projectOption);
  if (!project) return null;
  const rows = await api.listChangeRequests(project.projectId);
  return findMatchingChangeRequest(rows, id);
}

const approveSub = new Command("approve")
  .description("Approve a pending request")
  .argument("<id>", "Request id (from `envpilot requests`)")
  .option(
    "--project <name-or-id>",
    "Project to search for a change-request id (defaults to the linked project)"
  )
  .option(
    "--value <value>",
    "Secret value for a machine (valueless) request — CI only; interactively " +
      "you are prompted MASKED instead so the value stays out of shell history"
  )
  .option(
    "--value-stdin",
    "Read the secret value from stdin (CI-safe: keeps it out of argv), e.g. " +
      'printf %s "$SECRET" | envpilot requests approve <id> --value-stdin'
  )
  .option("--reason <text>", "Optional review note")
  .action(
    async (
      id: string,
      options: {
        project?: string;
        value?: string;
        valueStdin?: boolean;
        reason?: string;
      }
    ) => {
      try {
        if (!isAuthenticated()) throw notAuthenticated();
        const api = createAPIClient();

        const changeRequest = await findChangeRequest(api, id, options.project);
        if (changeRequest) {
          if (changeRequest.status !== "pending") {
            error(
              `Only pending change requests can be approved (current: ${changeRequest.status}).`
            );
            process.exit(1);
          }
          await withSpinner("Approving change request...", () =>
            api.reviewChangeRequest(id, "approve", options.reason)
          );
          success(`Change request approved: ${changeRequest.label}.`);
          return;
        }

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
        if (value !== undefined && process.stdin.isTTY) {
          error(
            "--value is for CI only — interactively you are prompted masked so the secret stays out of shell history. Re-run without --value."
          );
          process.exit(1);
        }
        if (options.valueStdin) {
          value = (await readStdin()).replace(/\r?\n$/, "");
          if (!value) {
            error("--value-stdin was passed but stdin was empty.");
            process.exit(1);
          }
        }
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
    }
  );

const rejectSub = new Command("reject")
  .description("Reject a pending request")
  .argument("<id>", "Request id (from `envpilot requests`)")
  .option(
    "--project <name-or-id>",
    "Project to search for a change-request id (defaults to the linked project)"
  )
  .option("--reason <text>", "Optional review note shown to the requester")
  .action(
    async (id: string, options: { project?: string; reason?: string }) => {
      try {
        if (!isAuthenticated()) throw notAuthenticated();
        const api = createAPIClient();

        const changeRequest = await findChangeRequest(api, id, options.project);
        if (changeRequest) {
          await withSpinner("Rejecting change request...", () =>
            api.reviewChangeRequest(id, "reject", options.reason)
          );
          success("Change request rejected.");
          return;
        }

        await withSpinner("Rejecting request...", () =>
          api.reviewRequest(id, "reject", options.reason)
        );
        success("Request rejected.");
      } catch (err) {
        await handleError(err);
      }
    }
  );

const cancelSub = new Command("cancel")
  .description("Cancel a pending request (your own, or as a reviewer)")
  .argument("<id>", "Request id (from `envpilot requests`)")
  .option(
    "--project <name-or-id>",
    "Project to search for a change-request id (defaults to the linked project)"
  )
  .action(async (id: string, options: { project?: string }) => {
    try {
      if (!isAuthenticated()) throw notAuthenticated();
      const api = createAPIClient();

      const changeRequest = await findChangeRequest(api, id, options.project);
      if (changeRequest) {
        await withSpinner("Canceling change request...", () =>
          api.cancelChangeRequest(id)
        );
        success("Change request canceled.");
        return;
      }

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
  .option(
    "--changes",
    "List change requests (protected-environment proposals) instead of variable requests"
  )
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
