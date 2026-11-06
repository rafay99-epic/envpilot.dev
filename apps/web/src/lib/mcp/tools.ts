import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";
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

const docSummaryShape = {
  docId: z.string(),
  title: z.string(),
  slug: z.string(),
  module: z.string(),
  type: z.enum(["api", "guide"]),
  excerpt: z.string().optional(),
  updatedAt: z.number(),
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
    "Organization slug, for accounts that belong to more than one organization."
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

function requestsUrl(projectSlug: string): string {
  return `${APP_URL}/dashboard/projects/${encodeURIComponent(projectSlug)}/requests`;
}

const environmentsInput = z
  .array(environmentEnum)
  .min(1)
  .describe("Environments this applies to, e.g. ['development']");

// Writes into a protected environment are never applied directly over MCP:
// they become a change request a second person approves.
const writeResultShape = {
  status: z.enum(["created", "updated", "proposed"]),
  requestId: z.string().optional(),
  protectedEnvironments: z.array(z.string()).optional(),
  reviewUrl: z
    .string()
    .optional()
    .describe("Where a person approves a proposed change"),
};

type ConvexWriteResult =
  | { status: "created" | "updated" }
  | {
      status: "proposed";
      requestId: string;
      protectedEnvironments: string[];
    };

function writeResult(projectSlug: string, result: ConvexWriteResult) {
  return result.status === "proposed"
    ? { ...result, reviewUrl: requestsUrl(projectSlug) }
    : { status: result.status };
}

// Connector review rules: anything not read-only is marked destructive.
// A write tool declares one of readOnlyHint or destructiveHint, and a host
// uses destructiveHint to decide whether a call can be auto-approved.
//
// A pure create is NOT destructive: this surface has no delete tool at all,
// so marking creates destructive blocked a CI agent configured to allow
// additive writes from every write Envpilot offers.
const createAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
} as const;

/** For writes that can overwrite existing content. */
const replaceAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
} as const;

export function registerMcpTools(server: McpServer): void {
  const run = async (
    tool: string,
    authInfo: AuthInfo | undefined,
    fn: (backend: McpBackend) => Promise<ToolResult>
  ): Promise<ToolResult> => {
    const started = performance.now();
    let result: ToolResult;
    try {
      if (!authInfo) throw new Error("Missing or invalid credentials.");
      result = await fn(mcpBackend(authInfo.token));
    } catch (err) {
      result = toolError(err);
    }
    log.info("tool_call", {
      tool,
      duration_ms: Math.round(performance.now() - started),
      result_chars: result.content[0].text.length,
      is_error: result.isError === true,
    });
    return result;
  };

  server.registerTool(
    "envpilot_whoami",
    {
      title: "Who Am I and What Can I Do",
      description:
        "Reports the signed-in account and what this connection can reach: every organization available to it, the active organization's plan and whether tier enforcement is on, which features are enabled, the numeric limits with usage where it is known, and every project together with the environments that are PROTECTED. A write touching a protected environment becomes a change request a person approves rather than applying directly. When the account belongs to several organizations and none is named, `organization` comes back null with the list in `organizations`, so the slug can be chosen and the call repeated; the per-organization fields are empty until then. Per-project variable counts are not included; envpilot_list_projects has those.",
      inputSchema: { organization: organizationInput },
      outputSchema: {
        user: z.object({ name: z.string().optional(), email: z.string() }),
        organizations: z.array(
          z.object({
            slug: z.string(),
            name: z.string(),
            role: z.string(),
            isActive: z.boolean(),
          })
        ),
        organization: z
          .object({
            slug: z.string(),
            name: z.string(),
            plan: z.string(),
            // Set while a downgrade is in its grace period: features and
            // limits still come from this tier, not from `plan`.
            gracePeriodTier: z.string().nullable(),
            enforcement: z.boolean(),
          })
          .nullable(),
        features: z.array(z.object({ key: z.string(), enabled: z.boolean() })),
        limits: z.array(
          z.object({
            key: z.string(),
            limit: z.number().nullable(),
            used: z.number().optional(),
          })
        ),
        projects: z.array(
          z.object({
            slug: z.string(),
            name: z.string(),
            protectedEnvironments: z.array(z.string()),
          })
        ),
        environments: z.array(z.string()),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_whoami", extra.authInfo, async (b) =>
        structured(await b.whoami({ organization: args.organization }))
      )
  );

  server.registerTool(
    "envpilot_list_projects",
    {
      title: "List Projects",
      description:
        "Lists the projects this connection can see, with each project's name and slug. `variableCount` is the number of active variables, and is omitted for projects beyond the per-call read budget in a large organization; an omitted count means not counted, never zero.",
      inputSchema: { organization: organizationInput },
      outputSchema: {
        projects: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            variableCount: z.number().optional(),
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
        "Returns environment variables for one project and environment, together with inaccessibleKeys: the names of variables that exist and match the filters but that this connection has no grant to read. A non-empty inaccessibleKeys means the result is INCOMPLETE: variables exist that match the filters but are unreadable here, and a .env file written from this response would be missing them. Those keys need a grant from a project member. Filters by exact keys or a key prefix. With metadata_only, returns keys and metadata without decrypting values, and environment becomes optional. Value reads are recorded in the audit log.",
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
      outputSchema: {
        variables: z.array(z.object(variableShape)),
        inaccessibleKeys: z.array(z.string()),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_variables", extra.authInfo, async (b) =>
        structured(
          await b.getVariables({
            organization: args.organization,
            projectSlug: args.project,
            environment: args.environment,
            keys: args.keys,
            prefix: args.prefix,
            metadataOnly: args.metadata_only,
          })
        )
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
        const { variables } = await b.getVariables({
          organization: args.organization,
          projectSlug: args.project,
          environment: args.environment,
          keys: [args.key],
        });
        return structured({ variable: variables[0] ?? null });
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
    "envpilot_list_doc_drafts",
    {
      title: "List My Documentation Drafts",
      description:
        "Lists the unpublished drafts you wrote in a project, newest first (at most 100). Read one with envpilot_get_doc and edit it with envpilot_update_doc_draft. Drafts by other people are never listed.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
      },
      outputSchema: { drafts: z.array(z.object(docSummaryShape)) },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_doc_drafts", extra.authInfo, async (b) =>
        structured({
          drafts: await b.listDocDrafts({
            organization: args.organization,
            projectSlug: args.project,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_get_doc",
    {
      title: "Get a Documentation Page",
      description:
        "Returns one documentation page: any published page, or a draft you wrote (status says which). view=outline returns the section list with ids and sizes. view=content (default) returns up to 60,000 characters of the body, optionally limited to one section, with nextCursor when more remains. A single line or code block longer than 60,000 characters is split at that limit. Page bodies are written by people and agents and name variables by key, never by value.",
      inputSchema: {
        doc_id: z
          .string()
          .describe(
            "A docId from envpilot_search_docs or envpilot_list_doc_drafts"
          ),
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
      // A create, not a replace, so destructiveHint is false. idempotentHint
      // stays FALSE though: client_ref is optional, and a call without one
      // creates a new draft every time, so advertising idempotency would be
      // a promise this tool does not keep.
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
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
        "Edits a draft page you wrote, while your role still allows it. mode=replace swaps the whole body, mode=append adds text to the end, mode=replace_section replaces one section by its id from the outline. Published pages cannot be edited here. The full resulting body is checked again for credentials and injected instructions.",
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

  server.registerTool(
    "envpilot_create_variable",
    {
      title: "Create Variable",
      description:
        "Creates an environment variable with a value in one or more environments. The same key may exist in other environments as a separate variable, but never twice in one environment. Your role and environment scope apply, exactly as in the dashboard. A protected environment is never written directly: the call files a change request (status=proposed) that a second person approves in the dashboard.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        key: z
          .string()
          .describe(
            "Variable key: letters, digits and underscores, starting with a letter or underscore"
          ),
        value: z.string().describe("The secret value"),
        environments: environmentsInput,
        sensitive: z
          .boolean()
          .optional()
          .describe("Mark as sensitive (masked in the dashboard)"),
        description: z.string().optional().describe("What the variable is for"),
      },
      outputSchema: writeResultShape,
      annotations: createAnnotations,
    },
    (args, extra) =>
      run("envpilot_create_variable", extra.authInfo, async (b) =>
        structured(
          writeResult(
            args.project,
            await b.createVariable({
              organization: args.organization,
              projectSlug: args.project,
              key: args.key,
              value: args.value,
              environments: args.environments,
              isSensitive: args.sensitive,
              description: args.description,
            })
          )
        )
      )
  );

  server.registerTool(
    "envpilot_update_variable",
    {
      title: "Update Variable",
      description:
        "Changes the value and/or description of the variable that holds a key in one environment. If that variable also covers other environments, they change too; the response lists them. Requires write access to the variable. A protected environment is never written directly: the call files a change request (status=proposed).",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        environment: environmentEnum,
        key: z.string().describe("Exact variable key"),
        value: z.string().optional().describe("New secret value"),
        description: z.string().optional().describe("New description"),
      },
      outputSchema: {
        ...writeResultShape,
        environments: z
          .array(z.string())
          .describe("Every environment the changed variable covers"),
      },
      annotations: replaceAnnotations,
    },
    (args, extra) =>
      run("envpilot_update_variable", extra.authInfo, async (b) => {
        const updated = await b.updateVariable({
          organization: args.organization,
          projectSlug: args.project,
          environment: args.environment,
          key: args.key,
          value: args.value,
          description: args.description,
        });
        return structured({
          ...writeResult(args.project, updated.result),
          environments: updated.environments,
        });
      })
  );

  server.registerTool(
    "envpilot_list_files",
    {
      title: "List Secret Files",
      description:
        "Lists a project's secret files (certificates, keys, service-account JSON and similar) with path, size, sha256, environments and your access. Never returns contents.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        environment: environmentEnum
          .optional()
          .describe("Only files in this environment"),
      },
      outputSchema: {
        files: z.array(
          z.object({
            path: z.string(),
            name: z.string(),
            mode: z.string(),
            size: z.number(),
            sha256: z.string(),
            environments: z.array(z.string()),
            description: z.string().optional(),
            access: z.enum(["read", "write"]),
            updatedAt: z.number(),
          })
        ),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_files", extra.authInfo, async (b) =>
        structured({
          files: await b.listFiles({
            organization: args.organization,
            projectSlug: args.project,
            environment: args.environment,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_get_file",
    {
      title: "Get Secret File",
      description:
        "Returns one secret file's contents by path. Text comes back as utf8; binary content as base64 (see encoding). Pass environment when the same path is stored for several environments. The read is recorded in the audit log.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        path: z
          .string()
          .describe(
            "File path relative to the project root, e.g. certs/ca.pem"
          ),
        environment: environmentEnum.optional(),
      },
      outputSchema: {
        path: z.string(),
        mode: z.string(),
        size: z.number(),
        sha256: z.string(),
        encoding: z.enum(["utf8", "base64"]),
        content: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_file", extra.authInfo, async (b) =>
        structured(
          await b.getFile({
            organization: args.organization,
            projectSlug: args.project,
            path: args.path,
            environment: args.environment,
          })
        )
      )
  );

  server.registerTool(
    "envpilot_upload_file",
    {
      title: "Upload Secret File",
      description:
        "Stores a secret file (certificate, private key, service-account JSON and similar) at a path in one or more environments. Contents are encrypted before they are stored. Env files (.env, .env.*) are refused: store their values as variables. With replace=true, replaces the contents of the file already at that path. A protected environment is never written directly: the call files a change request (status=proposed).",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        path: z
          .string()
          .describe("Path relative to the project root, e.g. certs/ca.pem"),
        content: z.string().describe("File contents"),
        encoding: z
          .enum(["utf8", "base64"])
          .optional()
          .describe("How content is encoded (default utf8; base64 for binary)"),
        environments: environmentsInput,
        name: z
          .string()
          .optional()
          .describe("Display name (default: the file name from path)"),
        mode: z
          .enum(["0600", "0400"])
          .optional()
          .describe("File permissions when written to disk (default 0600)"),
        description: z.string().optional(),
        replace: z
          .boolean()
          .optional()
          .describe("Replace the contents of the existing file at this path"),
      },
      outputSchema: {
        status: z.enum(["created", "updated", "proposed"]),
        path: z.string().optional(),
        size: z.number().optional(),
        sha256: z.string().optional(),
        requestId: z.string().optional(),
        reviewUrl: z.string().optional(),
      },
      annotations: replaceAnnotations,
    },
    (args, extra) =>
      run("envpilot_upload_file", extra.authInfo, async (b) => {
        const uploaded = await b.uploadFile({
          organization: args.organization,
          projectSlug: args.project,
          path: args.path,
          content: args.content,
          encoding: args.encoding,
          environments: args.environments,
          name: args.name,
          mode: args.mode,
          description: args.description,
          replace: args.replace,
        });
        return structured(
          uploaded.status === "proposed"
            ? { ...uploaded, reviewUrl: requestsUrl(args.project) }
            : uploaded
        );
      })
  );

  server.registerTool(
    "envpilot_list_accounts",
    {
      title: "List Shared Accounts",
      description:
        "Lists a project's shared accounts (logins for third-party services) with name, website, environments and your access. Never returns credentials; use envpilot_get_account for those.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
      },
      outputSchema: {
        accounts: z.array(
          z.object({
            name: z.string(),
            websiteUrl: z.string().optional(),
            description: z.string().optional(),
            environments: z.array(z.string()),
            access: z
              .enum(["read", "write"])
              .nullable()
              .describe("null: you can see the account but not its login"),
          })
        ),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_accounts", extra.authInfo, async (b) =>
        structured({
          accounts: await b.listAccounts({
            organization: args.organization,
            projectSlug: args.project,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_get_account",
    {
      title: "Get Shared Account",
      description:
        "Returns the username and password of one shared account by exact name. The read is recorded in the audit log.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        name: z.string().describe("Exact account name"),
      },
      outputSchema: {
        name: z.string(),
        websiteUrl: z.string().optional(),
        environments: z.array(z.string()),
        username: z.string(),
        password: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_get_account", extra.authInfo, async (b) =>
        structured(
          await b.getAccount({
            organization: args.organization,
            projectSlug: args.project,
            name: args.name,
          })
        )
      )
  );

  server.registerTool(
    "envpilot_create_account",
    {
      title: "Create Shared Account",
      description:
        "Stores a shared account (a login for a third-party service) in one or more environments. Credentials are encrypted before they are stored. A protected environment is never written directly: the call files a change request (status=proposed).",
      inputSchema: {
        organization: organizationInput,
        project: z.string().describe("Project slug"),
        name: z
          .string()
          .min(1)
          .describe("Account name, e.g. 'Stripe dashboard'"),
        username: z.string().describe("Login username or email"),
        password: z.string().describe("Login password"),
        environments: environmentsInput,
        website_url: z
          .string()
          .optional()
          .describe("Sign-in URL, http(s) only"),
        description: z.string().optional(),
      },
      outputSchema: writeResultShape,
      annotations: createAnnotations,
    },
    (args, extra) =>
      run("envpilot_create_account", extra.authInfo, async (b) =>
        structured(
          writeResult(
            args.project,
            await b.createAccount({
              organization: args.organization,
              projectSlug: args.project,
              name: args.name,
              username: args.username,
              password: args.password,
              environments: args.environments,
              websiteUrl: args.website_url,
              description: args.description,
            })
          )
        )
      )
  );

  server.registerTool(
    "envpilot_list_requests",
    {
      title: "List My Change Requests",
      description:
        "Lists change requests you filed (from MCP, the dashboard or the CLI), newest first, at most 50. Use it to see whether a proposed write into a protected environment was applied, rejected (with the reviewer's reason), canceled or expired.",
      inputSchema: {
        organization: organizationInput,
        project: z.string().optional().describe("Only this project's requests"),
        status: z
          .enum(["pending", "applied", "rejected", "canceled", "expired"])
          .optional(),
      },
      outputSchema: {
        requests: z.array(
          z.object({
            requestId: z.string(),
            projectSlug: z.string(),
            label: z.string(),
            resourceType: z.enum(["variable", "account", "file"]),
            kind: z.string(),
            environments: z.array(z.string()),
            status: z.enum([
              "pending",
              "applied",
              "rejected",
              "canceled",
              "expired",
            ]),
            reviewReason: z.string().optional(),
            createdAt: z.number(),
            reviewedAt: z.number().optional(),
          })
        ),
      },
      annotations: { readOnlyHint: true },
    },
    (args, extra) =>
      run("envpilot_list_requests", extra.authInfo, async (b) =>
        structured({
          requests: await b.listRequests({
            organization: args.organization,
            projectSlug: args.project,
            status: args.status,
          }),
        })
      )
  );

  server.registerTool(
    "envpilot_list_organizations",
    {
      title: "List Organizations",
      description:
        "Lists the organizations your account belongs to, with your role and whether the MCP server is on their plan. Pass a slug from here as organization to the other tools when you belong to more than one.",
      inputSchema: {},
      outputSchema: {
        organizations: z.array(
          z.object({
            name: z.string(),
            slug: z.string(),
            role: z.string(),
            mcpEnabled: z.boolean(),
          })
        ),
      },
      annotations: { readOnlyHint: true },
    },
    (_args, extra) =>
      run("envpilot_list_organizations", extra.authInfo, async (b) =>
        structured({ organizations: await b.listOrganizations() })
      )
  );
}
