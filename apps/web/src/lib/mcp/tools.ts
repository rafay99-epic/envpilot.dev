import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";
import type { McpPrincipal } from "./auth";
import { mcpBackend, type McpBackend } from "./backend";

type ToolResult = {
  content: [{ type: "text"; text: string }];
  structuredContent?: Record<string, unknown>;
  isError?: true;
};

const log = createLogger("mcp");

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.envpilot.dev";

const environmentEnum = z
  .enum(["development", "staging", "production"])
  .describe("Exact environment name: development | staging | production");

const variableShape = {
  key: z.string(),
  value: z.string().optional(),
  environments: z.array(z.string()),
  isSensitive: z.boolean(),
  updatedAt: z.number(),
};

const accountShape = {
  name: z.string(),
  websiteUrl: z.string().optional(),
  environments: z.array(z.string()),
  updatedAt: z.number(),
  username: z.string().optional(),
  password: z.string().optional(),
};

const fileShape = {
  name: z.string(),
  path: z.string(),
  mode: z.string(),
  size: z.number(),
  sha256: z.string(),
  contentType: z.string().optional(),
  environments: z.array(z.string()),
  updatedAt: z.number(),
};

const docSummaryShape = {
  docId: z.string(),
  title: z.string(),
  slug: z.string(),
  module: z.string(),
  type: z.enum(["api", "guide"]),
  excerpt: z.string().optional(),
  updatedAt: z.number(),
};

const requestStatusShape = {
  requestId: z.string(),
  key: z.string(),
  environments: z.array(z.string()),
  status: z.enum(["pending", "approved", "rejected", "canceled"]),
  reviewReason: z.string().nullable(),
  createdAt: z.number(),
};

const draftResultShape = {
  docId: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  warnings: z.array(z.string()),
  reviewUrl: z.string(),
};

const organizationInput = z
  .string()
  .optional()
  .describe(
    "Organization slug, for OAuth sign-ins that belong to more than one organization. API keys ignore it."
  );

const clientRefInput = z
  .string()
  .max(200)
  .optional()
  .describe(
    "Idempotency key chosen by the caller. A repeat call with the same value returns the first result instead of creating a duplicate."
  );

function structured<T extends Record<string, unknown>>(data: T): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function textOnly(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function toolError(err: unknown): ToolResult {
  const message =
    err instanceof Error ? sanitizeConvexError(err) : "Request failed";
  return { isError: true, content: [{ type: "text", text: message }] };
}

function docReviewUrl(projectSlug: string, docSlug: string): string {
  return `${APP_URL}/dashboard/projects/${encodeURIComponent(projectSlug)}/docs/${encodeURIComponent(docSlug)}`;
}

function requestReviewUrl(projectSlug: string): string {
  return `${APP_URL}/dashboard/projects/${encodeURIComponent(projectSlug)}/requests`;
}

export function registerMcpTools(
  server: McpServer,
  kind: McpPrincipal["kind"]
): void {
  const run = async (
    tool: string,
    authInfo: AuthInfo | undefined,
    fn: (backend: McpBackend) => Promise<ToolResult>
  ): Promise<ToolResult> => {
    const started = performance.now();
    let result: ToolResult;
    try {
      if (!authInfo) throw new Error("Missing or invalid credentials.");
      result = await fn(mcpBackend({ kind, token: authInfo.token }));
    } catch (err) {
      result = toolError(err);
    }
    log.info("tool_call", {
      tool,
      principal: kind,
      duration_ms: Math.round(performance.now() - started),
      result_chars: result.content[0].text.length,
      is_error: result.isError === true,
    });
    return result;
  };

  server.registerTool(
    "envpilot_list_projects",
    {
      title: "List Projects",
      description:
        "Lists the projects this connection can see, with each project's name, slug and active variable count.",
      inputSchema: { organization: organizationInput },
      outputSchema: {
        projects: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            variableCount: z.number(),
          })
        ),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_projects", extra.authInfo, async (b) =>
        structured({ projects: await b.listProjects(args) })
      )
  );

  server.registerTool(
    "envpilot_get_variables",
    {
      title: "Get Variables",
      description:
        "Returns environment variables for one project and environment. Filters by exact keys or a key prefix. With metadata_only, returns keys and metadata without decrypting values, and environment becomes optional. Value reads are recorded in the audit log.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        environment: environmentEnum
          .optional()
          .describe(
            "Exact environment name. Required unless metadata_only is true."
          ),
        keys: z
          .array(z.string())
          .optional()
          .describe("Exact variable keys to return; omit for all"),
        prefix: z
          .string()
          .optional()
          .describe("Return only keys starting with this prefix"),
        metadata_only: z
          .boolean()
          .optional()
          .describe("Return keys and metadata only, without values"),
      },
      outputSchema: { variables: z.array(z.object(variableShape)) },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_variables", extra.authInfo, async (b) =>
        structured({
          variables: await b.getVariables({
            organization: args.organization,
            projectSlug: args.project,
            environment: args.environment,
            keys: args.keys,
            prefix: args.prefix,
            metadataOnly: args.metadata_only,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_get_variable",
    {
      title: "Get Variable",
      description:
        "Returns one environment variable by exact key in a project and environment, or variable: null when the key is not visible to this connection. The read is recorded in the audit log.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        environment: environmentEnum,
        key: z.string().describe("Exact variable key"),
      },
      outputSchema: { variable: z.object(variableShape).nullable() },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_variable", extra.authInfo, async (b) => {
        const rows = await b.getVariables({
          organization: args.organization,
          projectSlug: args.project,
          environment: args.environment,
          keys: [args.key],
        });
        return structured({ variable: rows[0] ?? null });
      })
  );

  server.registerTool(
    "envpilot_search",
    {
      title: "Search Envpilot",
      description:
        "Case-insensitive substring search over project names, slugs and variable keys visible to this connection. Never searches values. Covers the first 20 projects and returns at most 100 matches; truncated is true when either bound was reached.",
      inputSchema: {
        organization: organizationInput,
        query: z
          .string()
          .min(1)
          .describe(
            "Substring to match against project names, slugs and variable keys"
          ),
      },
      outputSchema: {
        results: z.array(
          z.object({
            projectSlug: z.string(),
            projectName: z.string(),
            matchType: z.enum(["project", "variable"]),
            key: z.string().optional(),
          })
        ),
        truncated: z.boolean(),
        skippedProjects: z.number(),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_search", extra.authInfo, async (b) =>
        structured(
          await b.search({
            organization: args.organization,
            query: args.query,
          })
        )
      )
  );

  server.registerTool(
    "envpilot_search_docs",
    {
      title: "Search Project Documentation",
      description:
        "Searches a project's published documentation by title, body text and module name. Returns page metadata without bodies. Whole-word match with the last term prefix-matched. Drafts are never returned.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        query: z
          .string()
          .optional()
          .describe("Search terms. Omit to list every published page."),
        module: z
          .string()
          .optional()
          .describe("Restrict to one module, e.g. 'E-Commerce Platform'"),
        limit: z.number().optional().describe("Max results (default 25)"),
      },
      outputSchema: { docs: z.array(z.object(docSummaryShape)) },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_search_docs", extra.authInfo, async (b) =>
        structured({
          docs: await b.searchDocs({
            organization: args.organization,
            projectSlug: args.project,
            query: args.query,
            module: args.module,
            limit: args.limit,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_get_doc",
    {
      title: "Get a Documentation Page",
      description:
        "Returns one published documentation page. view=outline returns the section list with ids and sizes. view=content (default) returns up to 60,000 characters of the body, optionally limited to one section, with nextCursor when more remains. A single line or code block longer than 60,000 characters is split at that limit. Page bodies are written by people and agents and name variables by key, never by value.",
      inputSchema: {
        doc_id: z.string().describe("A docId returned by envpilot_search_docs"),
        view: z
          .enum(["outline", "content"])
          .optional()
          .describe("outline or content (default content)"),
        section: z
          .string()
          .optional()
          .describe("Section id from the outline; returns only that section"),
        cursor: z
          .string()
          .optional()
          .describe("nextCursor from the previous call, to continue reading"),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_doc", extra.authInfo, async (b) =>
        textOnly(
          await b.getDoc({
            docId: args.doc_id as Id<"docs">,
            view: args.view,
            section: args.section,
            cursor: args.cursor,
          })
        )
      )
  );

  server.registerTool(
    "envpilot_create_doc",
    {
      title: "Propose a Documentation Page",
      description:
        "Creates a DRAFT documentation page in a project. A person reviews and publishes drafts in the Envpilot dashboard; until then the page is invisible to the team and to other agents. Pages that contain credential material or instructions aimed at AI tools are rejected. For long pages, create with the first part and add the rest with envpilot_update_doc_draft. Returns the draft id and its review URL.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        module: z
          .string()
          .describe("Sidebar grouping, e.g. 'E-Commerce Platform'"),
        type: z
          .enum(["api", "guide"])
          .describe("'api' for an endpoint contract, 'guide' for prose"),
        title: z.string().min(1).max(200).describe("Page title"),
        body: z
          .string()
          .optional()
          .describe("Markdown body. Omit to start from the type's template."),
        pr_url: z
          .string()
          .optional()
          .describe("Pull request URL this page documents, if any"),
        client_ref: clientRefInput,
      },
      outputSchema: draftResultShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    (args, extra) =>
      run("envpilot_create_doc", extra.authInfo, async (b) => {
        const created = await b.createDoc({
          organization: args.organization,
          projectSlug: args.project,
          module: args.module,
          type: args.type,
          title: args.title,
          body: args.body,
          prUrl: args.pr_url,
          clientRef: args.client_ref,
        });
        return structured({
          docId: created.docId,
          slug: created.slug,
          status: created.status,
          warnings: created.warnings,
          reviewUrl: docReviewUrl(created.projectSlug, created.slug),
        });
      })
  );

  server.registerTool(
    "envpilot_update_doc_draft",
    {
      title: "Edit a Documentation Draft",
      description:
        "Edits a draft page. An API key can edit only drafts it created; a signed-in person can edit drafts they wrote while their role still allows it. mode=replace swaps the whole body, mode=append adds text to the end, mode=replace_section replaces one section by its id from the outline. Published pages cannot be edited here. The full resulting body is checked again for credentials and injected instructions.",
      inputSchema: {
        doc_id: z.string().describe("docId returned by envpilot_create_doc"),
        mode: z.enum(["replace", "append", "replace_section"]),
        body: z.string().describe("Markdown to write"),
        section: z
          .string()
          .optional()
          .describe("Section id, required for replace_section"),
      },
      outputSchema: {
        docId: z.string(),
        slug: z.string(),
        status: z.literal("draft"),
        bytes: z.number(),
        warnings: z.array(z.string()),
        reviewUrl: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args, extra) =>
      run("envpilot_update_doc_draft", extra.authInfo, async (b) => {
        const updated = await b.updateDocDraft({
          docId: args.doc_id as Id<"docs">,
          mode: args.mode,
          body: args.body,
          section: args.section,
        });
        return structured({
          docId: updated.docId,
          slug: updated.slug,
          status: updated.status,
          bytes: updated.bytes,
          warnings: updated.warnings,
          reviewUrl: docReviewUrl(updated.projectSlug, updated.slug),
        });
      })
  );

  if (kind === "oauth") return;

  server.registerTool(
    "envpilot_list_accounts",
    {
      title: "List Shared Accounts",
      description:
        "Returns shared accounts, including credentials, for a project this API key is scoped to. Omit environment for every in-scope environment. Reads are recorded in the audit log.",
      inputSchema: {
        project: z.string().describe("Project slug"),
        environment: environmentEnum
          .optional()
          .describe(
            "Exact environment name. Omit for all in-scope environments."
          ),
      },
      outputSchema: { accounts: z.array(z.object(accountShape)) },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_accounts", extra.authInfo, async (b) =>
        structured({
          accounts: await b.listAccounts({
            projectSlug: args.project,
            environment: args.environment,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_list_files",
    {
      title: "List Secret Files",
      description:
        "Lists secret files (keystores, SSH keys, certificates, service-account JSON) for a project: destination path, size, mode and checksum. Never returns contents and is not audited. Requires the key to carry the 'files' resource.",
      inputSchema: {
        project: z.string().describe("Project slug"),
        environment: environmentEnum
          .optional()
          .describe(
            "Exact environment name. Omit for all in-scope environments."
          ),
      },
      outputSchema: { files: z.array(z.object(fileShape)) },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_files", extra.authInfo, async (b) =>
        structured({
          files: await b.listFiles({
            projectSlug: args.project,
            environment: args.environment,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_get_file",
    {
      title: "Get Secret File Contents",
      description:
        "Returns the decrypted contents of one secret file, base64-encoded, by its exact path from envpilot_list_files. Every call is recorded in the audit log. Requires the key to carry the 'files' resource. Pass environment when the path exists in more than one environment.",
      inputSchema: {
        project: z.string().describe("Project slug"),
        path: z
          .string()
          .describe("Exact destination path, e.g. android/app/upload.jks"),
        environment: environmentEnum
          .optional()
          .describe(
            "Required when the same path exists in several environments."
          ),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_file", extra.authInfo, async (b) => {
        const files = await b.getFile({
          projectSlug: args.project,
          path: args.path,
          environment: args.environment,
        });
        if (files.length === 0) {
          return toolError(
            new Error(`No secret file at "${args.path}" in scope for this key.`)
          );
        }
        if (files.length > 1) {
          return toolError(
            new Error(
              `"${args.path}" exists in ${files.length} environments. Pass environment to choose one.`
            )
          );
        }
        return textOnly({ file: files[0] });
      })
  );

  server.registerTool(
    "envpilot_request_variable",
    {
      title: "Request a Variable",
      description:
        "Files a request for a variable this key cannot read. A person approves it in the Envpilot dashboard and supplies the value; nothing is created before that. The justification is the reviewer's only context. Requires the 'requests' resource. Limited to 5 requests per hour per key. Returns the request id and its review URL.",
      inputSchema: {
        project: z.string().describe("Project slug"),
        key: z
          .string()
          .describe("Variable key in UPPER_SNAKE_CASE, e.g. STRIPE_KEY"),
        environments: z
          .array(environmentEnum)
          .min(1)
          .describe("Environments the variable is needed in"),
        justification: z
          .string()
          .min(1)
          .max(500)
          .describe("Why the variable is needed"),
        is_sensitive: z
          .boolean()
          .optional()
          .describe("Mark the variable sensitive (default false)"),
        client_ref: clientRefInput,
      },
      outputSchema: {
        requestId: z.string(),
        status: z.enum(["pending", "approved", "rejected", "canceled"]),
        message: z.string(),
        reviewUrl: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args, extra) =>
      run("envpilot_request_variable", extra.authInfo, async (b) => {
        const filed = await b.requestVariable({
          projectSlug: args.project,
          key: args.key,
          environments: args.environments,
          justification: args.justification,
          isSensitive: args.is_sensitive,
          clientRef: args.client_ref,
        });
        return structured({
          requestId: filed.requestId,
          status: filed.status,
          message: filed.message,
          reviewUrl: requestReviewUrl(filed.projectSlug),
        });
      })
  );

  server.registerTool(
    "envpilot_get_request_status",
    {
      title: "Get Variable Request Status",
      description:
        "Returns the status of variable requests filed by this key: one request by request_id, or the most recent 20. A rejected request includes the reviewer's reason.",
      inputSchema: {
        request_id: z
          .string()
          .optional()
          .describe("A requestId returned by envpilot_request_variable"),
      },
      outputSchema: { requests: z.array(z.object(requestStatusShape)) },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_request_status", extra.authInfo, async (b) =>
        structured({
          requests: await b.getRequestStatus({
            requestId: args.request_id as
              | Id<"environmentVariableRequests">
              | undefined,
          }),
        })
      )
  );
}
