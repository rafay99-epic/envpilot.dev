import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerMcpTools } from "@/lib/mcp/tools";

type Registered = {
  title?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

function toolsFor(kind: "key" | "oauth"): Map<string, Registered> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerMcpTools(server, kind);
  return new Map(
    Object.entries(server["_registeredTools"] as Record<string, Registered>)
  );
}

const BEHAVIOR_INSTRUCTIONS =
  /\b(tell the user|do not|don't|never echo|you must|always call|start here)\b/i;

describe("MCP tool definitions", () => {
  for (const kind of ["key", "oauth"] as const) {
    it(`meet the connector review rules for ${kind} credentials`, () => {
      for (const [name, tool] of toolsFor(kind)) {
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
  }

  it("keeps accounts, files and requests on API keys only", () => {
    const keyOnly = [
      "envpilot_list_accounts",
      "envpilot_list_files",
      "envpilot_get_file",
      "envpilot_request_variable",
      "envpilot_get_request_status",
    ];
    const oauth = toolsFor("oauth");
    const key = toolsFor("key");
    for (const name of keyOnly) {
      expect(oauth.has(name), name).toBe(false);
      expect(key.has(name), name).toBe(true);
    }
    expect(key.size).toBe(13);
    expect(oauth.size).toBe(8);
  });
});
