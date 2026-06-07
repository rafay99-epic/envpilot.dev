import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { NextRequest } from "next/server";
import { createLogger, tokenPrefix } from "@/lib/logger";

const log = createLogger("lib/mobile-auth");

export interface MobileAuthResult {
  valid: boolean;
  userId?: Id<"users">;
  user?: {
    id: Id<"users">;
    email: string;
    name?: string;
  };
  error?: string;
}

export function extractBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

export async function validateMobileToken(
  convex: ConvexHttpClient,
  token: string
): Promise<MobileAuthResult> {
  try {
    const result = await convex.query(api.mobileTokens.validateToken, {
      accessToken: token,
    });

    if (!result.valid) {
      return { valid: false, error: result.reason };
    }

    convex
      .mutation(api.mobileTokens.updateLastUsed, { accessToken: token })
      .catch((error) => {
        log.warn("mobile_token_last_used_update_failed", {
          token: tokenPrefix(token),
          reason: error instanceof Error ? error.message : "unknown",
        });
      });

    return {
      valid: true,
      userId: result.userId,
      user: result.user,
    };
  } catch (error) {
    log.error(
      "mobile_token_validation_failed",
      { token: tokenPrefix(token) },
      error
    );
    return { valid: false, error: "Failed to validate token" };
  }
}

export async function authenticateMobileRequest(
  request: NextRequest,
  convex: ConvexHttpClient
): Promise<MobileAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return { valid: false, error: "Missing authorization header" };
  }
  if (!token.startsWith("mob_")) {
    return { valid: false, error: "Invalid token format" };
  }
  return validateMobileToken(convex, token);
}

export function unauthorizedResponse(message: string = "Unauthorized") {
  return Response.json(
    { error: message, code: "UNAUTHORIZED" },
    { status: 401 }
  );
}
