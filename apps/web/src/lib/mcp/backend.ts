import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getConvexUrl } from "@/lib/public-api";

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

/**
 * The Convex calls behind each MCP tool. Every call carries the raw OAuth
 * access token; the Convex action verifies it again before reading anything,
 * so no user id ever crosses this boundary.
 */
export function mcpBackend(token: string) {
  const convex = convexClient();

  return {
    listProjects: ({ organization }: Org) =>
      convex.action(api.features.api.oauth.listProjects, {
        token,
        organization,
      }),

    getVariables: (
      args: Org & {
        projectSlug: string;
        environment?: string;
        keys?: string[];
        prefix?: string;
        metadataOnly?: boolean;
      }
    ) => convex.action(api.features.api.oauth.getVariables, { token, ...args }),

    search: (args: Org & { query: string }) =>
      convex.action(api.features.api.oauth.search, { token, ...args }),

    searchDocs: (
      args: Org & {
        projectSlug: string;
        query?: string;
        module?: string;
        limit?: number;
      }
    ) => convex.action(api.features.api.oauth.searchDocs, { token, ...args }),

    getDoc: (args: DocView & { docId: Id<"docs"> }) =>
      convex.action(api.features.api.oauth.getDoc, { token, ...args }),

    createDoc: (args: NewDoc) =>
      convex.action(api.features.api.oauth.createDoc, { token, ...args }),

    updateDocDraft: (args: DraftEdit) =>
      convex.action(api.features.api.oauth.updateDocDraft, { token, ...args }),
  };
}

export type McpBackend = ReturnType<typeof mcpBackend>;
