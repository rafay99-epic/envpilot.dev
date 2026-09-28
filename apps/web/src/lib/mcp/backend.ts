import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getConvexUrl } from "@/lib/public-api";
import type { McpPrincipal } from "./auth";

const surface = "mcp_server";

type Org = { organization?: string };
type DocView = {
  view?: "outline" | "content";
  section?: string;
  cursor?: string;
};
type DraftEdit = {
  docId: Id<"docs">;
  mode: "replace" | "append" | "replace_section";
  body: string;
  section?: string;
};
type NewDoc = Org & {
  projectSlug: string;
  module: string;
  type: "api" | "guide";
  title: string;
  body?: string;
  prUrl?: string;
  clientRef?: string;
};

function convexClient(): ConvexHttpClient {
  const url = getConvexUrl();
  if (!url) throw new Error("Service is not configured (missing Convex URL).");
  return new ConvexHttpClient(url);
}

export function mcpBackend({ kind, token }: McpPrincipal) {
  const convex = convexClient();
  const oauth = kind === "oauth";

  return {
    listProjects: ({ organization }: Org) =>
      oauth
        ? convex.action(api.features.api.oauth.listProjects, {
            token,
            organization,
          })
        : convex.action(api.features.api.reads.listProjects, {
            token,
            surface,
          }),

    getVariables: ({
      organization,
      ...args
    }: Org & {
      projectSlug: string;
      environment?: string;
      keys?: string[];
      prefix?: string;
      metadataOnly?: boolean;
    }) =>
      oauth
        ? convex.action(api.features.api.oauth.getVariables, {
            token,
            organization,
            ...args,
          })
        : convex.action(api.features.api.reads.getProjectVariables, {
            token,
            surface,
            ...args,
          }),

    search: ({ organization, query }: Org & { query: string }) =>
      oauth
        ? convex.action(api.features.api.oauth.search, {
            token,
            organization,
            query,
          })
        : convex.action(api.features.api.reads.searchKeys, {
            token,
            surface,
            query,
          }),

    searchDocs: ({
      organization,
      ...args
    }: Org & {
      projectSlug: string;
      query?: string;
      module?: string;
      limit?: number;
    }) =>
      oauth
        ? convex.action(api.features.api.oauth.searchDocs, {
            token,
            organization,
            ...args,
          })
        : convex.action(api.features.api.docs.searchDocs, {
            token,
            surface,
            ...args,
          }),

    getDoc: (args: DocView & { docId: Id<"docs"> }) =>
      oauth
        ? convex.action(api.features.api.oauth.getDoc, { token, ...args })
        : convex.action(api.features.api.docs.getDoc, {
            token,
            surface,
            ...args,
          }),

    createDoc: ({ organization, ...args }: NewDoc) =>
      oauth
        ? convex.action(api.features.api.oauth.createDoc, {
            token,
            organization,
            ...args,
          })
        : convex.action(api.features.api.docs.createDoc, {
            token,
            surface,
            ...args,
          }),

    updateDocDraft: (args: DraftEdit) =>
      oauth
        ? convex.action(api.features.api.oauth.updateDocDraft, {
            token,
            ...args,
          })
        : convex.action(api.features.api.docs.updateDocDraft, {
            token,
            surface,
            ...args,
          }),

    listAccounts: (args: { projectSlug: string; environment?: string }) =>
      convex.action(api.features.api.reads.getProjectAccounts, {
        token,
        surface,
        ...args,
      }),

    listFiles: (args: { projectSlug: string; environment?: string }) =>
      convex.action(api.features.api.reads.getProjectFiles, {
        token,
        surface,
        metadataOnly: true,
        ...args,
      }),

    getFile: (args: {
      projectSlug: string;
      path: string;
      environment?: string;
    }) =>
      convex.action(api.features.api.reads.getProjectFiles, {
        token,
        surface,
        projectSlug: args.projectSlug,
        environment: args.environment,
        paths: [args.path],
      }),

    requestVariable: (args: {
      projectSlug: string;
      key: string;
      environments: string[];
      justification: string;
      isSensitive?: boolean;
      clientRef?: string;
    }) =>
      convex.action(api.features.api.requests.createVariableRequest, {
        token,
        surface,
        ...args,
      }),

    getRequestStatus: (args: {
      requestId?: Id<"environmentVariableRequests">;
    }) =>
      convex.action(api.features.api.requests.getRequestStatus, {
        token,
        surface,
        ...args,
      }),
  };
}

export type McpBackend = ReturnType<typeof mcpBackend>;
