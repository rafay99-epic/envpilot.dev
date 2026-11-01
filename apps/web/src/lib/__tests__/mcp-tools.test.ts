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

  it("offers the eight sign-in tools and nothing that needed an API key", () => {
    expect([...registeredTools().keys()].sort()).toEqual([
      "envpilot_create_doc",
      "envpilot_get_doc",
      "envpilot_get_variable",
      "envpilot_get_variables",
      "envpilot_list_projects",
      "envpilot_search",
      "envpilot_search_docs",
      "envpilot_update_doc_draft",
    ]);
  });
});
