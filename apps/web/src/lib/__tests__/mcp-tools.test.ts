import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerMcpTools } from "@/lib/mcp/tools";

type Registered = {
  title?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

function registeredTools(): Map<string, Registered> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerMcpTools(server);
  return new Map(
    Object.entries(server["_registeredTools"] as Record<string, Registered>)
  );
}

const BEHAVIOR_INSTRUCTIONS =
  /\b(tell the user|do not|don't|never echo|you must|always call|start here)\b/i;

describe("MCP tool definitions", () => {
  it("meet the connector review rules", () => {
    for (const [name, tool] of registeredTools()) {
      expect(name.length, name).toBeLessThanOrEqual(64);
      expect(tool.title, name).toBeTruthy();
      const hints = tool.annotations ?? {};
      expect(
        hints.readOnlyHint === true || hints.destructiveHint === true,
        name
      ).toBe(true);
      expect(tool.description ?? "", name).not.toMatch(BEHAVIOR_INSTRUCTIONS);
    }
  });

  it("offers the sign-in tools and nothing that needed an API key", () => {
    expect([...registeredTools().keys()].sort()).toEqual([
      "envpilot_create_account",
      "envpilot_create_doc",
      "envpilot_create_variable",
      "envpilot_get_account",
      "envpilot_get_doc",
      "envpilot_get_file",
      "envpilot_get_variable",
      "envpilot_get_variables",
      "envpilot_list_accounts",
      "envpilot_list_doc_drafts",
      "envpilot_list_files",
      "envpilot_list_organizations",
      "envpilot_list_projects",
      "envpilot_list_requests",
      "envpilot_search",
      "envpilot_search_docs",
      "envpilot_update_doc_draft",
      "envpilot_update_variable",
      "envpilot_upload_file",
    ]);
  });
});
