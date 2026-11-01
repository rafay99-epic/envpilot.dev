import type { DatabaseReader } from "../_generated/server";

/**
 * The one-click MCP OAuth migration. An admin flips the `mcpApiKeysRetired`
 * setting (admin panel, Dashboard) and from then on the MCP server refuses
 * API keys: `_authorizeRequest` denies every `mcp_server` call with
 * `mcp_keys_retired`. Turning it off restores keys. REST, the GitHub Action
 * and Docker never read it.
 *
 * The first time it turns on, features/api/mcpRetirement.ts emails everyone
 * who manages a key MCP accepted and shows them a dashboard card until they
 * press OK. `NOTICES_STARTED_SETTING` records that, so re-toggling never
 * mails anyone twice.
 */

export const MCP_KEYS_RETIRED_SETTING = "mcpApiKeysRetired";
export const NOTICES_STARTED_SETTING = "mcpApiKeysRetiredNoticesAt";

export const MCP_SETUP_URL = "https://docs.envpilot.dev/mcp/setup";

export const MCP_KEYS_RETIRED_MESSAGE = `API keys no longer work on the Envpilot MCP server. Remove the Authorization header from your MCP config and reconnect with sign-in: ${MCP_SETUP_URL}`;

export async function mcpKeysRetired(db: DatabaseReader): Promise<boolean> {
  const row = await db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", MCP_KEYS_RETIRED_SETTING))
    .first();
  return row?.value === "true";
}
