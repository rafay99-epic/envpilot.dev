import type { DatabaseReader } from "../_generated/server";

/**
 * The MCP sign-in announcement. The MCP server only accepts OAuth sign-in;
 * API keys are not read by it at all. An admin flips the
 * `mcpApiKeysRetired` setting (admin panel, Dashboard) to tell people: the
 * first time it turns on, features/api/mcpRetirement.ts emails the creator
 * of each key MCP used to accept (or the org's API-key managers if the
 * creator left), once, and shows them a dashboard card until they press OK. Turning it off hides the card. `NOTICES_STARTED_SETTING`
 * records the first run, so re-toggling never mails anyone twice.
 */

export const MCP_KEYS_RETIRED_SETTING = "mcpApiKeysRetired";
export const NOTICES_STARTED_SETTING = "mcpApiKeysRetiredNoticesAt";

export const MCP_SETUP_URL = "https://docs.envpilot.dev/mcp/setup";

export async function mcpKeysRetired(db: DatabaseReader): Promise<boolean> {
  const row = await db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", MCP_KEYS_RETIRED_SETTING))
    .first();
  return row?.value === "true";
}
