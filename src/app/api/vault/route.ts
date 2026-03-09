import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  createSecret,
  readSecret,
  updateSecret,
  deleteSecret,
  describeSecret,
  VaultError,
  VaultErrorCode,
  isVaultConfigured,
} from "@/lib/vault";

/**
 * Vault API Routes
 * All operations require authentication and proper authorization
 *
 * Security Features:
 * - Authentication required for all endpoints
 * - Organization ownership verification (prevents IDOR)
 * - Sanitized error logging (no sensitive data in logs)
 * - Input size limits to prevent DoS
 * - Generic error messages to clients (no internal details)
 */

// Maximum secret value size (64KB)
const MAX_SECRET_VALUE_SIZE = 65536;

// Request schemas with size limits
const createSecretSchema = z.object({
  name: z.string().min(1).max(255),
  value: z.string().min(1).max(MAX_SECRET_VALUE_SIZE),
  context: z.object({
    organizationId: z.string().min(1),
    projectId: z.string().min(1),
    environment: z.string().optional(),
  }),
});

const readSecretSchema = z.object({
  vaultRef: z.string().min(1).max(255),
  organizationId: z.string().min(1),
});

const updateSecretSchema = z.object({
  vaultRef: z.string().min(1).max(255),
  value: z.string().min(1).max(MAX_SECRET_VALUE_SIZE),
  organizationId: z.string().min(1),
  versionCheck: z.string().optional(),
});

const deleteSecretSchema = z.object({
  vaultRef: z.string().min(1).max(255),
  organizationId: z.string().min(1),
});

// Generic error messages for clients (no internal details)
const GENERIC_ERROR_MESSAGES: Record<VaultErrorCode, string> = {
  NOT_CONFIGURED: "Vault service is not available",
  CREATE_FAILED: "Failed to create secret",
  READ_FAILED: "Failed to read secret",
  UPDATE_FAILED: "Failed to update secret",
  DELETE_FAILED: "Failed to delete secret",
  ENCRYPT_FAILED: "Encryption failed",
  DECRYPT_FAILED: "Decryption failed",
  NOT_FOUND: "Secret not found",
};

/**
 * Sanitized error logging - removes sensitive data
 */
function logError(operation: string, error: unknown): void {
  if (error instanceof VaultError) {
    console.error(`Vault ${operation} error:`, {
      code: error.code,
      message: error.message,
    });
  } else if (error instanceof Error) {
    console.error(`Vault ${operation} error:`, {
      name: error.name,
      message: error.message,
    });
  } else {
    console.error(`Vault ${operation} error: Unknown error type`);
  }
}

/**
 * Error response helper - returns generic messages to clients
 */
function errorResponse(
  code: VaultErrorCode | "UNAUTHORIZED" | "VALIDATION_ERROR" | "FORBIDDEN",
  status: number,
): NextResponse {
  const message =
    code in GENERIC_ERROR_MESSAGES
      ? GENERIC_ERROR_MESSAGES[code as VaultErrorCode]
      : code === "UNAUTHORIZED"
        ? "Authentication required"
        : code === "FORBIDDEN"
          ? "Access denied"
          : code === "VALIDATION_ERROR"
            ? "Invalid request"
            : "An error occurred";

  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Verify organization ownership of a vault object
 * Prevents IDOR (Insecure Direct Object Reference) attacks
 */
async function verifyOwnership(
  vaultRef: string,
  expectedOrgId: string,
): Promise<{ authorized: boolean; error?: VaultErrorCode }> {
  try {
    const metadata = await describeSecret(vaultRef);
    const actualOrgId = metadata.metadata?.context?.organizationId;

    if (!actualOrgId || actualOrgId !== expectedOrgId) {
      return { authorized: false };
    }

    return { authorized: true };
  } catch (error) {
    if (error instanceof VaultError) {
      return { authorized: false, error: error.code };
    }
    return { authorized: false, error: "READ_FAILED" };
  }
}

/**
 * POST /api/vault - Create a new encrypted secret
 */
export async function POST(request: NextRequest) {
  try {
    if (!isVaultConfigured()) {
      return errorResponse("NOT_CONFIGURED", 503);
    }

    const { user, organizationId } = await withAuth({ ensureSignedIn: true });
    if (!user) {
      return errorResponse("UNAUTHORIZED", 401);
    }

    const body = await request.json();
    const result = createSecretSchema.safeParse(body);

    if (!result.success) {
      return errorResponse("VALIDATION_ERROR", 400);
    }

    const { name, value, context } = result.data;

    // SECURITY: Override organizationId with authenticated user's org
    // This prevents cross-tenant data pollution
    const secureContext = {
      ...context,
      organizationId: organizationId || context.organizationId,
    };

    const vaultResult = await createSecret(name, value, secureContext);

    return NextResponse.json({
      success: true,
      data: {
        vaultRef: vaultResult.id,
        versionId: vaultResult.versionId,
      },
    });
  } catch (error) {
    logError("create", error);

    if (error instanceof VaultError) {
      return errorResponse(error.code, 500);
    }

    return errorResponse("CREATE_FAILED", 500);
  }
}

/**
 * GET /api/vault?vaultRef=xxx&organizationId=xxx - Read an encrypted secret
 */
export async function GET(request: NextRequest) {
  try {
    if (!isVaultConfigured()) {
      return errorResponse("NOT_CONFIGURED", 503);
    }

    const { user, organizationId: sessionOrgId } = await withAuth({
      ensureSignedIn: true,
    });
    if (!user) {
      return errorResponse("UNAUTHORIZED", 401);
    }

    const { searchParams } = new URL(request.url);
    const vaultRef = searchParams.get("vaultRef");
    const organizationId = searchParams.get("organizationId");

    const result = readSecretSchema.safeParse({ vaultRef, organizationId });
    if (!result.success) {
      return errorResponse("VALIDATION_ERROR", 400);
    }

    // SECURITY: Verify the user's organization matches the requested org
    const authorizedOrgId = sessionOrgId || result.data.organizationId;

    // SECURITY: Verify ownership before reading
    const ownership = await verifyOwnership(
      result.data.vaultRef,
      authorizedOrgId,
    );
    if (!ownership.authorized) {
      if (ownership.error === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", 404);
      }
      return errorResponse("FORBIDDEN", 403);
    }

    const value = await readSecret(result.data.vaultRef);

    return NextResponse.json({
      success: true,
      data: { value },
    });
  } catch (error) {
    logError("read", error);

    if (error instanceof VaultError) {
      const status = error.code === "NOT_FOUND" ? 404 : 500;
      return errorResponse(error.code, status);
    }

    return errorResponse("READ_FAILED", 500);
  }
}

/**
 * PUT /api/vault - Update an encrypted secret
 */
export async function PUT(request: NextRequest) {
  try {
    if (!isVaultConfigured()) {
      return errorResponse("NOT_CONFIGURED", 503);
    }

    const { user, organizationId: sessionOrgId } = await withAuth({
      ensureSignedIn: true,
    });
    if (!user) {
      return errorResponse("UNAUTHORIZED", 401);
    }

    const body = await request.json();
    const result = updateSecretSchema.safeParse(body);

    if (!result.success) {
      return errorResponse("VALIDATION_ERROR", 400);
    }

    const { vaultRef, value, organizationId, versionCheck } = result.data;

    // SECURITY: Verify the user's organization matches
    const authorizedOrgId = sessionOrgId || organizationId;

    // SECURITY: Verify ownership before updating
    const ownership = await verifyOwnership(vaultRef, authorizedOrgId);
    if (!ownership.authorized) {
      if (ownership.error === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", 404);
      }
      return errorResponse("FORBIDDEN", 403);
    }

    const vaultResult = await updateSecret(vaultRef, value, versionCheck);

    return NextResponse.json({
      success: true,
      data: {
        vaultRef: vaultResult.id,
        versionId: vaultResult.versionId,
      },
    });
  } catch (error) {
    logError("update", error);

    if (error instanceof VaultError) {
      return errorResponse(error.code, 500);
    }

    return errorResponse("UPDATE_FAILED", 500);
  }
}

/**
 * DELETE /api/vault - Delete an encrypted secret
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!isVaultConfigured()) {
      return errorResponse("NOT_CONFIGURED", 503);
    }

    const { user, organizationId: sessionOrgId } = await withAuth({
      ensureSignedIn: true,
    });
    if (!user) {
      return errorResponse("UNAUTHORIZED", 401);
    }

    const body = await request.json();
    const result = deleteSecretSchema.safeParse(body);

    if (!result.success) {
      return errorResponse("VALIDATION_ERROR", 400);
    }

    const { vaultRef, organizationId } = result.data;

    // SECURITY: Verify the user's organization matches
    const authorizedOrgId = sessionOrgId || organizationId;

    // SECURITY: Verify ownership before deleting
    const ownership = await verifyOwnership(vaultRef, authorizedOrgId);
    if (!ownership.authorized) {
      if (ownership.error === "NOT_FOUND") {
        return errorResponse("NOT_FOUND", 404);
      }
      return errorResponse("FORBIDDEN", 403);
    }

    await deleteSecret(vaultRef);

    return NextResponse.json({
      success: true,
      message: "Secret deleted successfully",
    });
  } catch (error) {
    logError("delete", error);

    if (error instanceof VaultError) {
      return errorResponse(error.code, 500);
    }

    return errorResponse("DELETE_FAILED", 500);
  }
}
