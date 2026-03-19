import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id, Doc } from "@convex/_generated/dataModel";
import { NextRequest } from "next/server";

/**
 * Result of CLI token validation
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
export function extractBearerToken(request: NextRequest): string | null {
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
 * Validate a CLI access token
 */
export async function validateCLIToken(
  convex: ConvexHttpClient,
  token: string
): Promise<CLIAuthResult> {
  try {
    const result = await convex.query(api.cliSessions.validateToken, {
      accessToken: token,
    });

    if (!result.valid) {
      return {
        valid: false,
        error: result.reason || "Invalid token",
      };
    }

    // Update last used timestamp (fire and forget)
    convex
      .mutation(api.cliSessions.updateLastUsed, {
        accessToken: token,
      })
      .catch(() => {
        // Ignore errors in background update
      });

    return {
      valid: true,
      userId: result.userId,
      user: result.user,
    };
  } catch (error) {
    return {
      valid: false,
      error: "Failed to validate token",
    };
  }
}

/**
 * Middleware helper to authenticate CLI requests
 */
export async function authenticateCLIRequest(
  request: NextRequest,
  convex: ConvexHttpClient
): Promise<CLIAuthResult> {
  const token = extractBearerToken(request);

  if (!token) {
    return {
      valid: false,
      error: "Missing authorization header",
    };
  }

  return validateCLIToken(convex, token);
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

/**
 * Get user's organizations for CLI
 */
export async function getUserOrganizations(
  convex: ConvexHttpClient,
  userId: Id<"users">
): Promise<Array<Doc<"organizations"> & { role: string }>> {
  const memberships = await convex.query(api.organizations.listForUser, {
    userId,
  });
  return memberships as Array<Doc<"organizations"> & { role: string }>;
}
