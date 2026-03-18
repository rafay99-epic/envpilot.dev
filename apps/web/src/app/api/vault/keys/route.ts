import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  createDataKey,
  decryptDataKey,
  VaultError,
  isVaultConfigured,
} from "@/lib/vault";
import { verifyNotBot } from "@/lib/botid";

/**
 * Data Key Management API Routes
 * For client-side encryption with envelope encryption pattern
 *
 * Security Features:
 * - Authentication required
 * - Organization context enforced from session
 * - Sanitized error logging
 * - Input size limits
 */

const createKeySchema = z.object({
  context: z.object({
    organizationId: z.string().min(1),
    projectId: z.string().min(1),
    environment: z.string().optional(),
  }),
});

const decryptKeySchema = z.object({
  encryptedKeys: z.string().min(1).max(8192),
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
 * POST /api/vault/keys - Create a new data encryption key
 * Returns both the plaintext key (for immediate use) and encrypted keys (for storage)
 */
export async function POST(request: NextRequest) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

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
    const result = createKeySchema.safeParse(body);

    if (!result.success) {
      return errorResponse("Invalid request", 400, "VALIDATION_ERROR");
    }

    // SECURITY: Override organizationId with session org
    const secureContext = {
      ...result.data.context,
      organizationId: sessionOrgId || result.data.context.organizationId,
    };

    const keyPair = await createDataKey(secureContext);

    return NextResponse.json({
      success: true,
      data: {
        // The plaintext data key for immediate encryption operations
        dataKey: keyPair.dataKey,
        // The encrypted keys to store for later decryption
        encryptedKeys: keyPair.encryptedKeys,
        // The context used for key derivation
        context: keyPair.context,
      },
    });
  } catch (error) {
    logError("createDataKey", error);

    if (error instanceof VaultError) {
      return errorResponse("Failed to create data key", 500, error.code);
    }

    return errorResponse("Failed to create data key", 500, "CREATE_FAILED");
  }
}

/**
 * PUT /api/vault/keys - Decrypt a stored data encryption key
 */
export async function PUT(request: NextRequest) {
  try {
    const botResponse = await verifyNotBot();
    if (botResponse) return botResponse;

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
    const result = decryptKeySchema.safeParse(body);

    if (!result.success) {
      return errorResponse("Invalid request", 400, "VALIDATION_ERROR");
    }

    const dataKey = await decryptDataKey(result.data.encryptedKeys);

    return NextResponse.json({
      success: true,
      data: { dataKey },
    });
  } catch (error) {
    logError("decryptDataKey", error);

    if (error instanceof VaultError) {
      return errorResponse("Failed to decrypt data key", 500, error.code);
    }

    return errorResponse("Failed to decrypt data key", 500, "DECRYPT_FAILED");
  }
}
