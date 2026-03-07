import { WorkOS } from "@workos-inc/node";
import { vaultConfig } from "./vault-config";

/**
 * WorkOS Vault Service
 * Provides end-to-end encrypted storage for environment variables
 *
 * Security Features:
 * - Unique encryption key per secret (via KeyContext)
 * - Organization-level cryptographic isolation
 * - Envelope encryption (DEK + KEK)
 * - Encryption at rest
 */

// Initialize WorkOS client for Vault operations
let workosClient: WorkOS | null = null;

function getWorkOSClient(): WorkOS {
  if (!vaultConfig.isConfigured) {
    throw new Error(
      "WorkOS Vault is not configured. Please set WORKOS_API_KEY and WORKOS_CLIENT_ID.",
    );
  }

  if (!workosClient) {
    workosClient = new WorkOS(vaultConfig.apiKey, {
      clientId: vaultConfig.clientId,
    });
  }

  return workosClient;
}

/**
 * Key context for cryptographic isolation
 * Each secret gets a unique encryption key based on this context
 */
export interface VaultKeyContext {
  organizationId: string;
  projectId: string;
  environment?: string;
}

/**
 * Result from creating/updating a vault object
 */
export interface VaultObjectResult {
  id: string;
  versionId: string;
  keyId: string;
}

/**
 * Error types for Vault operations
 */
export class VaultError extends Error {
  constructor(
    message: string,
    public readonly code: VaultErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export type VaultErrorCode =
  | "NOT_CONFIGURED"
  | "CREATE_FAILED"
  | "READ_FAILED"
  | "UPDATE_FAILED"
  | "DELETE_FAILED"
  | "ENCRYPT_FAILED"
  | "DECRYPT_FAILED"
  | "NOT_FOUND";

/**
 * Creates an encrypted secret in WorkOS Vault
 *
 * @param name - Unique identifier for the secret (e.g., "DATABASE_URL_prod")
 * @param value - The secret value to encrypt
 * @param context - Key context for cryptographic isolation
 * @returns Object containing vault reference ID and version
 */
export async function createSecret(
  name: string,
  value: string,
  context: VaultKeyContext,
): Promise<VaultObjectResult> {
  try {
    const workos = getWorkOSClient();

    const result = await workos.vault.createObject({
      name,
      value,
      context: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        environment: context.environment,
      },
    });

    return {
      id: result.id,
      versionId: result.versionId,
      keyId: result.keyId,
    };
  } catch (error) {
    throw new VaultError(
      `Failed to create secret "${name}" in vault`,
      "CREATE_FAILED",
      error,
    );
  }
}

/**
 * Reads and decrypts a secret from WorkOS Vault
 *
 * @param vaultRef - The vault object ID (stored as vaultRef in Convex)
 * @returns The decrypted secret value
 */
export async function readSecret(vaultRef: string): Promise<string> {
  try {
    const workos = getWorkOSClient();

    const result = await workos.vault.readObject({
      id: vaultRef,
    });

    if (!result.value) {
      throw new VaultError(
        `Secret with ID "${vaultRef}" has no value`,
        "NOT_FOUND",
      );
    }

    return result.value;
  } catch (error) {
    if (error instanceof VaultError) {
      throw error;
    }
    throw new VaultError(
      `Failed to read secret "${vaultRef}" from vault`,
      "READ_FAILED",
      error,
    );
  }
}

/**
 * Updates an encrypted secret in WorkOS Vault
 * Creates a new version while preserving the object ID
 *
 * @param vaultRef - The vault object ID
 * @param newValue - The new secret value to encrypt
 * @param versionCheck - Optional version ID for optimistic concurrency
 * @returns Updated object info including new version ID
 */
export async function updateSecret(
  vaultRef: string,
  newValue: string,
  versionCheck?: string,
): Promise<VaultObjectResult> {
  try {
    const workos = getWorkOSClient();

    const result = await workos.vault.updateObject({
      id: vaultRef,
      value: newValue,
      ...(versionCheck && { versionCheck }),
    });

    return {
      id: result.id,
      versionId: result.metadata.versionId,
      keyId: result.metadata.keyId,
    };
  } catch (error) {
    throw new VaultError(
      `Failed to update secret "${vaultRef}" in vault`,
      "UPDATE_FAILED",
      error,
    );
  }
}

/**
 * Deletes a secret from WorkOS Vault
 * Note: Deletion is scheduled and not immediate
 *
 * @param vaultRef - The vault object ID to delete
 */
export async function deleteSecret(vaultRef: string): Promise<void> {
  try {
    const workos = getWorkOSClient();

    await workos.vault.deleteObject({
      id: vaultRef,
    });
  } catch (error) {
    throw new VaultError(
      `Failed to delete secret "${vaultRef}" from vault`,
      "DELETE_FAILED",
      error,
    );
  }
}

/**
 * Encrypts data using organization-specific keys
 * Useful for encrypting data that needs to be stored outside of Vault
 *
 * @param data - The data to encrypt
 * @param context - Key context for encryption key derivation
 * @param associatedData - Optional AAD for additional integrity
 * @returns Encrypted data string
 */
export async function encryptData(
  data: string,
  context: VaultKeyContext,
  associatedData?: string,
): Promise<string> {
  try {
    const workos = getWorkOSClient();

    return await workos.vault.encrypt(
      data,
      {
        organizationId: context.organizationId,
        projectId: context.projectId,
        environment: context.environment,
      },
      associatedData,
    );
  } catch (error) {
    throw new VaultError("Failed to encrypt data", "ENCRYPT_FAILED", error);
  }
}

/**
 * Decrypts data that was encrypted using encryptData
 *
 * @param encryptedData - The encrypted data string
 * @param associatedData - The same AAD used during encryption
 * @returns Decrypted data string
 */
export async function decryptData(
  encryptedData: string,
  associatedData?: string,
): Promise<string> {
  try {
    const workos = getWorkOSClient();

    return await workos.vault.decrypt(encryptedData, associatedData);
  } catch (error) {
    throw new VaultError("Failed to decrypt data", "DECRYPT_FAILED", error);
  }
}

/**
 * Lists all versions of a secret (for audit/rollback)
 *
 * @param vaultRef - The vault object ID
 * @returns Array of version metadata
 */
export async function listSecretVersions(vaultRef: string) {
  try {
    const workos = getWorkOSClient();

    return await workos.vault.listObjectVersions({
      id: vaultRef,
    });
  } catch (error) {
    throw new VaultError(
      `Failed to list versions for secret "${vaultRef}"`,
      "READ_FAILED",
      error,
    );
  }
}

/**
 * Gets metadata about a secret without decrypting the value
 *
 * @param vaultRef - The vault object ID
 * @returns Object metadata (id, context, version, etc.)
 */
export async function describeSecret(vaultRef: string) {
  try {
    const workos = getWorkOSClient();

    return await workos.vault.describeObject({
      id: vaultRef,
    });
  } catch (error) {
    throw new VaultError(
      `Failed to describe secret "${vaultRef}"`,
      "READ_FAILED",
      error,
    );
  }
}

/**
 * Creates a data encryption key for client-side encryption
 * The key is returned along with encrypted key material for storage
 *
 * @param context - Key context for key derivation
 * @returns Data key pair with plaintext key and encrypted key material
 */
export async function createDataKey(context: VaultKeyContext) {
  try {
    const workos = getWorkOSClient();

    return await workos.vault.createDataKey({
      context: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        environment: context.environment,
      },
    });
  } catch (error) {
    throw new VaultError("Failed to create data key", "CREATE_FAILED", error);
  }
}

/**
 * Decrypts a data encryption key that was stored encrypted
 *
 * @param encryptedKeys - The encrypted key material from createDataKey
 * @returns The decrypted data key
 */
export async function decryptDataKey(encryptedKeys: string) {
  try {
    const workos = getWorkOSClient();

    return await workos.vault.decryptDataKey({
      keys: encryptedKeys,
    });
  } catch (error) {
    throw new VaultError("Failed to decrypt data key", "DECRYPT_FAILED", error);
  }
}

/**
 * Checks if the Vault service is properly configured
 */
export function isVaultConfigured(): boolean {
  return vaultConfig.isConfigured;
}
