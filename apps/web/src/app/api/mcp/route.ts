import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { APP_VERSIONS } from "@/lib/versions";
import { MCP_RESOURCE_METADATA_PATH, verifyMcpToken } from "@/lib/mcp/auth";
import { registerMcpTools } from "@/lib/mcp/tools";

/**
 * Remote MCP server. Clients sign in with WorkOS AuthKit (OAuth); the access
 * token is verified here for the 401 challenge and again inside every Convex
 * action before any data is read. API keys are not accepted.
 *
 * Stateless Streamable HTTP (mcp-handler 1.1.0 / SDK 1.29.0): no
 * `sessionIdGenerator`, no `redisUrl`.
 */

export const maxDuration = 300;

const mcpHandler = createMcpHandler(
  registerMcpTools,
  { serverInfo: { name: "envpilot", version: APP_VERSIONS.web } },
  { basePath: "/api", maxDuration, disableSse: true }
);

const handler = withMcpAuth(mcpHandler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
});

export { handler as GET, handler as POST, handler as DELETE };
