import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { APP_VERSIONS } from "@/lib/versions";
import {
  MCP_RESOURCE_METADATA_PATH,
  principalKind,
  verifyMcpToken,
} from "@/lib/mcp/auth";
import { registerMcpTools } from "@/lib/mcp/tools";

/**
 * Remote MCP server. Two credentials reach the same tools: an `envpk_` API
 * key, enforced per call by `_authorizeRequest`, and an OAuth access token
 * issued by WorkOS AuthKit, verified here for the 401 challenge and again
 * inside every Convex action before any data is read. The tool list depends
 * on the credential: accounts, secret files and variable requests stay on
 * API keys.
 *
 * Stateless Streamable HTTP (mcp-handler 1.1.0 / SDK 1.29.0): no
 * `sessionIdGenerator`, no `redisUrl`.
 */

export const maxDuration = 300;

const mcpHandlers = {
  key: createMcpHandler(
    (server) => registerMcpTools(server, "key"),
    { serverInfo: { name: "envpilot", version: APP_VERSIONS.web } },
    { basePath: "/api", maxDuration, disableSse: true }
  ),
  oauth: createMcpHandler(
    (server) => registerMcpTools(server, "oauth"),
    { serverInfo: { name: "envpilot", version: APP_VERSIONS.web } },
    { basePath: "/api", maxDuration, disableSse: true }
  ),
};

const handler = withMcpAuth(
  (req) => mcpHandlers[principalKind(req.auth)](req),
  verifyMcpToken,
  {
    required: true,
    resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
