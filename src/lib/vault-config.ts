import { z } from "zod";

/**
 * WorkOS Vault Configuration
 * Validates environment variables required for encrypted vault operations
 */
const vaultEnvSchema = z.object({
  WORKOS_API_KEY: z
    .string()
    .min(1, "WORKOS_API_KEY is required for Vault operations"),
  WORKOS_CLIENT_ID: z.string().min(1, "WORKOS_CLIENT_ID is required"),
});

export interface VaultConfig {
  apiKey: string;
  clientId: string;
  isConfigured: boolean;
}

function getVaultConfig(): VaultConfig {
  const result = vaultEnvSchema.safeParse({
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
  });

  if (!result.success) {
    const errors = result.error.issues.map(
      (e) => `${e.path.join(".")}: ${e.message}`,
    );
    console.error("Invalid WorkOS Vault configuration:", errors.join(", "));

    return {
      apiKey: "",
      clientId: "",
      isConfigured: false,
    };
  }

  return {
    apiKey: result.data.WORKOS_API_KEY,
    clientId: result.data.WORKOS_CLIENT_ID,
    isConfigured: true,
  };
}

export const vaultConfig = getVaultConfig();
