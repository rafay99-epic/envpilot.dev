import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import { mcpOAuthConfig } from "@/lib/mcp/auth";

export function GET(req: Request): Response {
  const config = mcpOAuthConfig();
  if (!config) {
    // 503, not 404. /api/mcp names this exact URL in its 401
    // WWW-Authenticate challenge, so a 404 told a client "sign in over
    // there" and then denied that anything was there: the client reports
    // "needs authentication" forever with no way to proceed. A 503 that
    // names the missing variables says the server is misconfigured, which
    // is the truth.
    return new Response(
      JSON.stringify({
        error: "mcp_not_configured",
        error_description:
          "This deployment is missing MCP_OAUTH_ISSUER and/or MCP_OAUTH_RESOURCE, so OAuth sign-in cannot be advertised.",
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          // Same as the metadata handler: a browser MCP client has to be
          // able to read the diagnostic, not just the success case.
          "access-control-allow-origin": "*",
        },
      }
    );
  }
  return protectedResourceHandler({
    authServerUrls: [config.issuer],
    resourceUrl: config.resource,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
