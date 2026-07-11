import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { getConvexUrl } from "@/lib/public-api";
import { APP_VERSIONS } from "@/lib/versions";

/**
 * Remote MCP server — read-only tools over the SAME Convex actions
 * (convex/features/api/reads.ts) and the SAME enforcement core
 * (`_authorizeRequest`) the public REST API v1 uses (PLAN §0: "One
 * enforcement core, three faces"). Nothing here re-implements auth, scope,
 * gating, rate limiting, or audit — every tool hands the bearer token
 * straight to a Convex action and lets it decide.
 *
 * Auth model: plain `Authorization: Bearer envpk_...` (see mcp-research.md
 * §2 — this is what Claude/Cursor/Claude Code connectors all actually use
 * day to day; full OAuth 2.1 resource-server metadata is deferred to v2).
 * `verifyToken` below is DELIBERATELY cheap — a shape check only — because
 * the real authorization (hash lookup, revocation/expiry, scope, tier gate,
 * rate limit, audit) happens per-tool-call inside the Convex actions via
 * `_authorizeRequest`. Passing gateFeature: "mcp_server" makes the tier gate
 * check the `mcp_server` registry flag rather than the REST surface's
 * `public_api` flag, so the two surfaces can be priced/toggled independently
 * even though they share every other line of enforcement logic.
 *
 * Stateless Streamable HTTP (mcp-handler 1.1.0 / SDK 1.29.0, the current
 * stable v1.x line — see mcp-research.md §6 on the unreleased v2): no
 * `sessionIdGenerator`, no `redisUrl`. Redis is only needed for SSE-stream
 * resumability, which is irrelevant for a request/response, tools-only
 * server with no long-lived subscriptions.
 */

export const maxDuration = 60;

// ==========================================
// Shared shapes / helpers
// ==========================================

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

const projectSummaryShape = {
  name: z.string(),
  slug: z.string(),
  variableCount: z.number(),
};

const environmentEnum = z
  .enum(["development", "staging", "production"])
  .describe("Exact environment name: development | staging | production");

/** Never log values or the bearer token — only safe, structural fields. */
function toolError(err: unknown): {
  isError: true;
  content: [{ type: "text"; text: string }];
} {
  const message = err instanceof Error ? err.message : "Request failed";
  return { isError: true, content: [{ type: "text", text: message }] };
}

const unauthorizedResult = {
  isError: true as const,
  content: [{ type: "text" as const, text: "Missing or invalid API key." }] as [
    { type: "text"; text: string },
  ],
};

function requireConvexUrl(): string {
  const url = getConvexUrl();
  if (!url) {
    throw new Error("Service is not configured (missing Convex URL).");
  }
  return url;
}

// ==========================================
// Server
// ==========================================

const baseHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "envpilot_list_projects",
      {
        title: "List Projects",
        description:
          "List the projects visible to this API key, with each project's name, slug, and active variable count.",
        inputSchema: {},
        outputSchema: { projects: z.array(z.object(projectSummaryShape)) },
        annotations: { readOnlyHint: true },
      },
      async (_args, extra) => {
        const authInfo = extra.authInfo as AuthInfo | undefined;
        if (!authInfo) return unauthorizedResult;
        try {
          const convex = new ConvexHttpClient(requireConvexUrl());
          const projects = await convex.action(
            api.features.api.reads.listProjects,
            { token: authInfo.token, gateFeature: "mcp_server" }
          );
          return {
            content: [{ type: "text", text: JSON.stringify({ projects }) }],
            structuredContent: { projects },
          };
        } catch (err) {
          return toolError(err);
        }
      }
    );

    server.registerTool(
      "envpilot_get_variables",
      {
        title: "Get Variables",
        description:
          "Fetch environment variables for a project/environment the API key is scoped to. Filter by exact keys, a key prefix, or pass metadata_only to skip vault decryption and return keys/metadata without values.",
        inputSchema: {
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
            .describe(
              "If true, skip vault decrypt and return keys/metadata only (no values)"
            ),
        },
        outputSchema: { variables: z.array(z.object(variableShape)) },
        annotations: { readOnlyHint: true },
      },
      async (args, extra) => {
        const authInfo = extra.authInfo as AuthInfo | undefined;
        if (!authInfo) return unauthorizedResult;
        try {
          const convex = new ConvexHttpClient(requireConvexUrl());
          const variables = await convex.action(
            api.features.api.reads.getProjectVariables,
            {
              token: authInfo.token,
              projectSlug: args.project,
              environment: args.environment,
              keys: args.keys,
              prefix: args.prefix,
              metadataOnly: args.metadata_only,
              gateFeature: "mcp_server",
            }
          );
          return {
            content: [{ type: "text", text: JSON.stringify({ variables }) }],
            structuredContent: { variables },
          };
        } catch (err) {
          return toolError(err);
        }
      }
    );

    server.registerTool(
      "envpilot_get_variable",
      {
        title: "Get Variable",
        description:
          "Fetch a single environment variable's value by exact key, in a specific project and environment. Returns variable: null if the key isn't present in scope.",
        inputSchema: {
          project: z.string().describe("Project slug"),
          environment: environmentEnum,
          key: z.string().describe("Exact variable key"),
        },
        outputSchema: { variable: z.object(variableShape).nullable() },
        annotations: { readOnlyHint: true },
      },
      async (args, extra) => {
        const authInfo = extra.authInfo as AuthInfo | undefined;
        if (!authInfo) return unauthorizedResult;
        try {
          const convex = new ConvexHttpClient(requireConvexUrl());
          const rows = await convex.action(
            api.features.api.reads.getProjectVariables,
            {
              token: authInfo.token,
              projectSlug: args.project,
              environment: args.environment,
              keys: [args.key],
              gateFeature: "mcp_server",
            }
          );
          const variable = rows[0] ?? null;
          return {
            content: [{ type: "text", text: JSON.stringify({ variable }) }],
            structuredContent: { variable },
          };
        } catch (err) {
          return toolError(err);
        }
      }
    );

    server.registerTool(
      "envpilot_list_accounts",
      {
        title: "List Shared Accounts",
        description:
          "List shared accounts (with credentials) for a project the API key is scoped to. Omit environment to return accounts across every environment in scope.",
        inputSchema: {
          project: z.string().describe("Project slug"),
          environment: environmentEnum
            .optional()
            .describe(
              "Exact environment name. Omit to return accounts across all in-scope environments."
            ),
        },
        outputSchema: { accounts: z.array(z.object(accountShape)) },
        annotations: { readOnlyHint: true },
      },
      async (args, extra) => {
        const authInfo = extra.authInfo as AuthInfo | undefined;
        if (!authInfo) return unauthorizedResult;
        try {
          const convex = new ConvexHttpClient(requireConvexUrl());
          const accounts = await convex.action(
            api.features.api.reads.getProjectAccounts,
            {
              token: authInfo.token,
              projectSlug: args.project,
              environment: args.environment,
              gateFeature: "mcp_server",
            }
          );
          return {
            content: [{ type: "text", text: JSON.stringify({ accounts }) }],
            structuredContent: { accounts },
          };
        } catch (err) {
          return toolError(err);
        }
      }
    );

    // Bounds on envpilot_search — a client-side scan over listProjects +
    // metadata_only getProjectVariables, NOT a real search index. Each
    // project scanned costs one more `apiMetadata` rate-limit unit (120/min
    // shared with the REST surface), so this is capped hard rather than
    // scanning every project an org-wide key can see.
    const SEARCH_MAX_PROJECTS = 20;
    const SEARCH_MAX_RESULTS = 100;

    server.registerTool(
      "envpilot_search",
      {
        title: "Search Envpilot",
        description:
          "Search project names/slugs and variable KEYS (never variable VALUES) for a substring, within this API key's scope. Bounded to the first 20 in-scope projects and 100 total matches per call — not a full-text index.",
        inputSchema: {
          query: z
            .string()
            .min(1)
            .describe(
              "Case-insensitive substring to match against project names/slugs and variable keys."
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
        },
        annotations: { readOnlyHint: true },
      },
      async (args, extra) => {
        const authInfo = extra.authInfo as AuthInfo | undefined;
        if (!authInfo) return unauthorizedResult;
        try {
          const convex = new ConvexHttpClient(requireConvexUrl());
          const projects = await convex.action(
            api.features.api.reads.listProjects,
            { token: authInfo.token, gateFeature: "mcp_server" }
          );

          const query = args.query.toLowerCase();
          const results: Array<{
            projectSlug: string;
            projectName: string;
            matchType: "project" | "variable";
            key?: string;
          }> = [];
          const scanned = projects.slice(0, SEARCH_MAX_PROJECTS);

          for (const project of scanned) {
            if (
              project.name.toLowerCase().includes(query) ||
              project.slug.toLowerCase().includes(query)
            ) {
              results.push({
                projectSlug: project.slug,
                projectName: project.name,
                matchType: "project",
              });
            }
            if (results.length >= SEARCH_MAX_RESULTS) break;

            try {
              const variables = await convex.action(
                api.features.api.reads.getProjectVariables,
                {
                  token: authInfo.token,
                  projectSlug: project.slug,
                  metadataOnly: true,
                  gateFeature: "mcp_server",
                }
              );
              for (const variable of variables) {
                if (variable.key.toLowerCase().includes(query)) {
                  results.push({
                    projectSlug: project.slug,
                    projectName: project.name,
                    matchType: "variable",
                    key: variable.key,
                  });
                  if (results.length >= SEARCH_MAX_RESULTS) break;
                }
              }
            } catch {
              // A project this key can list but that denies the "variables"
              // resource/environment (out-of-scope) is silently skipped for
              // key-matching — the project-name match above (if any) stands.
            }
            if (results.length >= SEARCH_MAX_RESULTS) break;
          }

          const truncated =
            projects.length > SEARCH_MAX_PROJECTS ||
            results.length >= SEARCH_MAX_RESULTS;

          return {
            content: [
              { type: "text", text: JSON.stringify({ results, truncated }) },
            ],
            structuredContent: { results, truncated },
          };
        } catch (err) {
          return toolError(err);
        }
      }
    );
  },
  {
    serverInfo: { name: "envpilot", version: APP_VERSIONS.web },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    disableSse: true,
    // No redisUrl: stateless, no SSE resumability needed for a tools-only
    // server (mcp-research.md §1).
  }
);

/**
 * Cheap shape check ONLY — real authorization happens per-tool-call inside
 * the Convex actions (`_authorizeRequest`). The raw bearer token is stashed
 * on `AuthInfo.token` so every tool handler above can hand it straight to
 * Convex without ever hashing/validating it itself. Never log the token.
 */
const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken || !bearerToken.startsWith("envpk_")) return undefined;
  return {
    token: bearerToken,
    // Not authoritative — real scope/resource/environment/tier enforcement
    // happens inside `_authorizeRequest` on every Convex action call above.
    scopes: [],
    clientId: "envpilot-mcp",
  };
};

const handler = withMcpAuth(baseHandler, verifyToken, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
