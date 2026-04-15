import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  encryptData,
  decryptData,
  VaultError,
  isVaultConfigured,
} from "@/lib/vault";

/**
 * Client-side encryption API Routes
 * For encrypting/decrypting data without storing in Vault
 *
 * Security Features:
 * - Authentication required
 * - Organization context enforced from session
 * - Sanitized error logging
 * - Input size limits
 */

// Maximum data size (64KB)
const MAX_DATA_SIZE = 65536;

const encryptSchema = z.object({
  data: z.string().min(1).max(MAX_DATA_SIZE),
  context: z.object({
    organizationId: z.string().min(1),
    projectId: z.string().min(1),
    environment: z.string().optional(),
  }),
  associatedData: z.string().max(1024).optional(),
});

const decryptSchema = z.object({
  encryptedData: z
    .string()
    .min(1)
    .max(MAX_DATA_SIZE * 2), // Encrypted data may be larger
  associatedData: z.string().max(1024).optional(),
});

/**
 * Sanitized error logging
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

function errorResponse(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * POST /api/vault/encrypt - Encrypt data using organization keys
 */
export async function POST(request: NextRequest) {
  try {
    if (!isVaultConfigured()) {
      return errorResponse(
        "Vault service is not available",
        503,
        "VAULT_NOT_CONFIGURED"
      );
    }

    const { user, organizationId: sessionOrgId } = await withAuth({
      ensureSignedIn: true,
    });
    if (!user) {
      return errorResponse("Authentication required", 401, "UNAUTHORIZED");
    }

    const body = await request.json();
    const result = encryptSchema.safeParse(body);

    if (!result.success) {
      return errorResponse("Invalid request", 400, "VALIDATION_ERROR");
    }

    const { data, context, associatedData } = result.data;

    // SECURITY: Override organizationId with session org
    const secureContext = {
      ...context,
      organizationId: sessionOrgId || context.organizationId,
    };

    const encryptedData = await encryptData(
      data,
      secureContext,
      associatedData
    );

    return NextResponse.json({
      success: true,
      data: { encryptedData },
    });
  } catch (error) {
    logError("encrypt", error);

    if (error instanceof VaultError) {
      return errorResponse("Encryption failed", 500, error.code);
    }

    return errorResponse("Encryption failed", 500, "ENCRYPT_FAILED");
  }
}

/**
 * PUT /api/vault/encrypt - Decrypt data
 */
export async function PUT(request: NextRequest) {
  try {
    if (!isVaultConfigured()) {
      return errorResponse(
        "Vault service is not available",
        503,
        "VAULT_NOT_CONFIGURED"
      );
    }

    const { user } = await withAuth({ ensureSignedIn: true });
    if (!user) {
      return errorResponse("Authentication required", 401, "UNAUTHORIZED");
    }

    const body = await request.json();
    const result = decryptSchema.safeParse(body);

    if (!result.success) {
      return errorResponse("Invalid request", 400, "VALIDATION_ERROR");
    }

    const { encryptedData, associatedData } = result.data;

    const decryptedData = await decryptData(encryptedData, associatedData);

    return NextResponse.json({
      success: true,
      data: { data: decryptedData },
    });
  } catch (error) {
    logError("decrypt", error);

    if (error instanceof VaultError) {
      return errorResponse("Decryption failed", 500, error.code);
    }

    return errorResponse("Decryption failed", 500, "DECRYPT_FAILED");
  }
}
