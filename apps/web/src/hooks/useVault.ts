import { useState, useCallback } from "react";

/**
 * Vault API Response Types
 */
interface VaultResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface CreateSecretResult {
  vaultRef: string;
  versionId: string;
}

interface UpdateSecretResult {
  vaultRef: string;
  versionId: string;
}

interface VaultKeyContext {
  organizationId: string;
  projectId: string;
  environment?: string;
}

interface DataKeyResult {
  dataKey: {
    key: string;
    id: string;
  };
  encryptedKeys: string;
  context: VaultKeyContext;
}

interface VaultStatus {
  configured: boolean;
  status: "ready" | "not_configured";
  features: {
    secretStorage: boolean;
    clientSideEncryption: boolean;
    dataKeyManagement: boolean;
    envelopeEncryption: boolean;
  };
}

/**
 * Hook return type
 */
interface UseVaultReturn {
  // State
  isLoading: boolean;
  error: string | null;

  // Secret operations (organizationId required for authorization)
  createSecret: (
    name: string,
    value: string,
    context: VaultKeyContext
  ) => Promise<CreateSecretResult | null>;
  readSecret: (
    vaultRef: string,
    organizationId: string
  ) => Promise<string | null>;
  updateSecret: (
    vaultRef: string,
    value: string,
    organizationId: string,
    versionCheck?: string
  ) => Promise<UpdateSecretResult | null>;
  deleteSecret: (vaultRef: string, organizationId: string) => Promise<boolean>;

  // Encryption operations
  encryptData: (
    data: string,
    context: VaultKeyContext,
    associatedData?: string
  ) => Promise<string | null>;
  decryptData: (
    encryptedData: string,
    associatedData?: string
  ) => Promise<string | null>;

  // Key management
  createDataKey: (context: VaultKeyContext) => Promise<DataKeyResult | null>;
  decryptDataKey: (
    encryptedKeys: string
  ) => Promise<{ key: string; id: string } | null>;

  // Status
  checkStatus: () => Promise<VaultStatus | null>;

  // Utility
  clearError: () => void;
}

/**
 * useVault - React hook for WorkOS Vault operations
 *
 * Provides a simple interface for:
 * - Creating, reading, updating, and deleting encrypted secrets
 * - Client-side encryption/decryption
 * - Data key management for envelope encryption
 *
 * @example
 * ```tsx
 * const { createSecret, readSecret, isLoading, error } = useVault()
 *
 * // Create a new encrypted secret
 * const result = await createSecret('API_KEY', 'sk-xxx', {
 *   organizationId: 'org_123',
 *   projectId: 'proj_456',
 *   environment: 'production'
 * })
 *
 * // Read the secret later
 * const value = await readSecret(result.vaultRef)
 * ```
 */
export function useVault(): UseVaultReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Generic fetch wrapper with error handling
   */
  const fetchVault = useCallback(
    async <T>(url: string, options: RequestInit = {}): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        const data: VaultResponse<T> = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || `Request failed with status ${response.status}`
          );
        }

        return data.data ?? null;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Create a new encrypted secret in WorkOS Vault
   */
  const createSecret = useCallback(
    async (
      name: string,
      value: string,
      context: VaultKeyContext
    ): Promise<CreateSecretResult | null> => {
      return fetchVault<CreateSecretResult>("/api/vault", {
        method: "POST",
        body: JSON.stringify({ name, value, context }),
      });
    },
    [fetchVault]
  );

  /**
   * Read and decrypt a secret from WorkOS Vault
   * @param vaultRef - The vault object ID
   * @param organizationId - Required for authorization check
   */
  const readSecret = useCallback(
    async (
      vaultRef: string,
      organizationId: string
    ): Promise<string | null> => {
      const params = new URLSearchParams({
        vaultRef,
        organizationId,
      });
      const result = await fetchVault<{ value: string }>(
        `/api/vault?${params.toString()}`
      );
      return result?.value ?? null;
    },
    [fetchVault]
  );

  /**
   * Update an encrypted secret in WorkOS Vault
   * @param vaultRef - The vault object ID
   * @param value - The new secret value
   * @param organizationId - Required for authorization check
   * @param versionCheck - Optional version ID for optimistic concurrency
   */
  const updateSecret = useCallback(
    async (
      vaultRef: string,
      value: string,
      organizationId: string,
      versionCheck?: string
    ): Promise<UpdateSecretResult | null> => {
      return fetchVault<UpdateSecretResult>("/api/vault", {
        method: "PUT",
        body: JSON.stringify({ vaultRef, value, organizationId, versionCheck }),
      });
    },
    [fetchVault]
  );

  /**
   * Delete a secret from WorkOS Vault
   * @param vaultRef - The vault object ID
   * @param organizationId - Required for authorization check
   */
  const deleteSecret = useCallback(
    async (vaultRef: string, organizationId: string): Promise<boolean> => {
      const result = await fetchVault<{ message: string }>("/api/vault", {
        method: "DELETE",
        body: JSON.stringify({ vaultRef, organizationId }),
      });
      return result !== null;
    },
    [fetchVault]
  );

  /**
   * Encrypt data using organization-specific keys
   */
  const encryptData = useCallback(
    async (
      data: string,
      context: VaultKeyContext,
      associatedData?: string
    ): Promise<string | null> => {
      const result = await fetchVault<{ encryptedData: string }>(
        "/api/vault/encrypt",
        {
          method: "POST",
          body: JSON.stringify({ data, context, associatedData }),
        }
      );
      return result?.encryptedData ?? null;
    },
    [fetchVault]
  );

  /**
   * Decrypt data
   */
  const decryptData = useCallback(
    async (
      encryptedData: string,
      associatedData?: string
    ): Promise<string | null> => {
      const result = await fetchVault<{ data: string }>("/api/vault/encrypt", {
        method: "PUT",
        body: JSON.stringify({ encryptedData, associatedData }),
      });
      return result?.data ?? null;
    },
    [fetchVault]
  );

  /**
   * Create a new data encryption key for envelope encryption
   */
  const createDataKey = useCallback(
    async (context: VaultKeyContext): Promise<DataKeyResult | null> => {
      return fetchVault<DataKeyResult>("/api/vault/keys", {
        method: "POST",
        body: JSON.stringify({ context }),
      });
    },
    [fetchVault]
  );

  /**
   * Decrypt a stored data encryption key
   */
  const decryptDataKey = useCallback(
    async (
      encryptedKeys: string
    ): Promise<{ key: string; id: string } | null> => {
      const result = await fetchVault<{ dataKey: { key: string; id: string } }>(
        "/api/vault/keys",
        {
          method: "PUT",
          body: JSON.stringify({ encryptedKeys }),
        }
      );
      return result?.dataKey ?? null;
    },
    [fetchVault]
  );

  /**
   * Check vault configuration status
   */
  const checkStatus = useCallback(async (): Promise<VaultStatus | null> => {
    return fetchVault<VaultStatus>("/api/vault/status");
  }, [fetchVault]);

  return {
    isLoading,
    error,
    createSecret,
    readSecret,
    updateSecret,
    deleteSecret,
    encryptData,
    decryptData,
    createDataKey,
    decryptDataKey,
    checkStatus,
    clearError,
  };
}
