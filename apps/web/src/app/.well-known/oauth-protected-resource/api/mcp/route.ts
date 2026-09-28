import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import { mcpOAuthConfig } from "@/lib/mcp/auth";

export function GET(req: Request): Response {
  const config = mcpOAuthConfig();
  if (!config) return new Response("Not found", { status: 404 });
  return protectedResourceHandler({
    authServerUrls: [config.issuer],
    resourceUrl: config.resource,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
