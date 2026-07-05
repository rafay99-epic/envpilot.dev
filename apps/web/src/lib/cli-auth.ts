import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/cli-auth");

// WorkOS AuthKit device-flow JWTs are verified against the client's JWKS. The
// client id is public (baked into the CLI/extension at build time) and shared
// server-side via process.env — mirror the browser-side NEXT_PUBLIC value.
const WORKOS_CLIENT_ID =
  process.env.NEXT_PUBLIC_WORKOS_CLIENT_ID ?? process.env.WORKOS_CLIENT_ID ?? "";
const WORKOS_ISSUER = `https://api.workos.com/user_management/${WORKOS_CLIENT_ID}`;
// createRemoteJWKSet caches keys in-process, so this is created once per server.
const workosJwks = createRemoteJWKSet(
  new URL(`https://api.workos.com/sso/jwks/${WORKOS_CLIENT_ID}`)
);

/**
 * Result of CLI request authentication
 */
export interface CLIAuthResult {
  valid: boolean;
  userId?: Id<"users">;
  user?: {
    id: Id<"users">;
    email: string;
    name?: string;
  };
  error?: string;
}

/**
 * Extract the Bearer token from the Authorization header
 */
export function extractBearerToken(request: NextRequest | Request): string | null {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7);
}

/**
 * Verify a WorkOS AuthKit device-flow JWT from the `Authorization: Bearer`
 * header. `withAuth()` only reads cookies, so the CLI/extension surfaces that
 * still hit a Next.js route (the vault crypto path) verify their JWT here.
 *
 * Returns the WorkOS user id (`sub`) plus the raw token (so the route can build
 * a setAuth'd Convex client to call the identity-verified functions), or null
 * if there is no valid token.
 */
export async function verifyWorkosBearer(
  request: NextRequest | Request
): Promise<{ workosUserId: string; token: string } | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  if (!WORKOS_CLIENT_ID) {
    log.error("workos_client_id_missing", {});
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, workosJwks, {
      issuer: WORKOS_ISSUER,
    });
    if (!payload.sub) return null;
    return { workosUserId: payload.sub, token };
  } catch (error) {
    log.warn("bearer_verification_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Authenticate a CLI request: verify the WorkOS JWT bearer, then resolve the
 * Convex user by WorkOS id. The returned `user`/`userId` identify the caller;
 * routes that need to call identity-verified Convex functions should ALSO build
 * a setAuth'd client from `verifyWorkosBearer(...).token`.
 */
export async function authenticateCLIRequest(
  request: NextRequest,
  convex: ConvexHttpClient
): Promise<CLIAuthResult> {
  const verified = await verifyWorkosBearer(request);

  if (!verified) {
    return {
      valid: false,
      error: "Missing or invalid authorization token",
    };
  }

  const user = await convex.query(api.users.getByWorkosId, {
    workosId: verified.workosUserId,
  });

  if (!user) {
    return { valid: false, error: "User not found" };
  }

  return {
    valid: true,
    userId: user._id,
    user: { id: user._id, email: user.email, name: user.name },
  };
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(message: string = "Unauthorized") {
  return Response.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  );
}

/**
 * Create a forbidden response
 */
export function forbiddenResponse(message: string = "Forbidden") {
  return Response.json({ error: message, code: "FORBIDDEN" }, { status: 403 });
}

/**
 * Create a tier limit exceeded response
 */
export function tierLimitResponse(
  message: string = "This feature is currently unavailable"
) {
  return Response.json(
    { error: message, code: "PAYMENT_REQUIRED" },
    { status: 402 }
  );
}

/**
 * Check if organization has CLI/API access via dynamic feature registry
 */
export async function checkCLIAccess(
  convex: ConvexHttpClient,
  organizationId: Id<"organizations">
): Promise<{ allowed: boolean; tier: string; reason?: string }> {
  const org = await convex.query(api.organizations.getById, { organizationId });

  if (!org) {
    return { allowed: false, tier: "free", reason: "Organization not found" };
  }

  const [cliCheck, apiCheck] = await Promise.all([
    convex.query(api.featureRegistry.checkFeature, {
      organizationId: org._id,
      featureKey: "cli_access",
    }),
    convex.query(api.featureRegistry.checkFeature, {
      organizationId: org._id,
      featureKey: "api_access",
    }),
  ]);

  const tier = cliCheck.tierName ?? apiCheck.tierName ?? "free";

  if (!apiCheck.allowed) {
    return {
      allowed: false,
      tier,
      reason: "API access is not available on your current tier.",
    };
  }
  if (!cliCheck.allowed) {
    return {
      allowed: false,
      tier,
      reason: "CLI access is not available on your current tier.",
    };
  }

  return { allowed: true, tier };
}

/**
 * Check if organization has extension/API access via dynamic feature registry
 */
export async function checkExtensionAccess(
  convex: ConvexHttpClient,
  organizationId: Id<"organizations">
): Promise<{ allowed: boolean; tier: string; reason?: string }> {
  const org = await convex.query(api.organizations.getById, { organizationId });

  if (!org) {
    return { allowed: false, tier: "free", reason: "Organization not found" };
  }

  const [extCheck, apiCheck] = await Promise.all([
    convex.query(api.featureRegistry.checkFeature, {
      organizationId: org._id,
      featureKey: "extension_access",
    }),
    convex.query(api.featureRegistry.checkFeature, {
      organizationId: org._id,
      featureKey: "api_access",
    }),
  ]);

  const tier = extCheck.tierName ?? apiCheck.tierName ?? "free";

  if (!apiCheck.allowed) {
    return {
      allowed: false,
      tier,
      reason: "API access is not available on your current tier.",
    };
  }
  if (!extCheck.allowed) {
    return {
      allowed: false,
      tier,
      reason: "VS Code extension access is not available on your current tier.",
    };
  }

  return { allowed: true, tier };
}
