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
      // Every tool must be CLASSIFIED, so a connector review and a host's
      // auto-approval policy never have to guess. This used to demand that
      // one of the two be true, which was fine while every write was
      // destructive. It is not: readOnlyHint false with destructiveHint false
      // is the correct, meaningful combination for an additive create, and
      // this surface has no delete tool at all. The rule is now that
      // readOnlyHint is always declared, and a non-read-only tool declares
      // destructiveHint explicitly either way.
      const hints = tool.annotations ?? {};
      expect(typeof hints.readOnlyHint, name).toBe("boolean");
      if (hints.readOnlyHint !== true) {
        expect(typeof hints.destructiveHint, name).toBe("boolean");
      }
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
      "envpilot_whoami",
    ]);
  });

  it("marks pure creates additive and only replacing writes destructive", () => {
    // There is no delete tool on this surface, so marking creates
    // destructive blocked a CI agent configured to allow additive writes
    // from every write Envpilot offers.
    const tools = registeredTools();
    for (const name of [
      "envpilot_create_variable",
      "envpilot_create_account",
      "envpilot_create_doc",
    ]) {
      expect(tools.get(name)?.annotations?.destructiveHint, name).toBe(false);
      expect(tools.get(name)?.annotations?.readOnlyHint, name).toBe(false);
    }
    for (const name of [
      "envpilot_update_variable",
      "envpilot_upload_file",
      "envpilot_update_doc_draft",
    ]) {
      expect(tools.get(name)?.annotations?.destructiveHint, name).toBe(true);
    }
  });

  it("envpilot_whoami describes the protected-environment consequence", () => {
    // The reason the tool exists: an agent needs to know, before it proposes
    // anything, which environments turn a write into a change request.
    const tool = registeredTools().get("envpilot_whoami");
    expect(tool).toBeTruthy();
    expect(tool!.description).toMatch(/protected/i);
    expect(tool!.description).toMatch(/change request/i);
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });
});
