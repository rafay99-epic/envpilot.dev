import { z } from "zod";

export const integrationProviderSchema = z.enum(["slack", "discord"]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const integrationOAuthStateSchema = z.object({
  provider: integrationProviderSchema,
  organizationId: z.string().min(1).max(100),
  slug: z.string().min(1).max(200),
  nonce: z.uuid(),
});
export type IntegrationOAuthState = z.infer<typeof integrationOAuthStateSchema>;

export function oauthStateCookie(provider: IntegrationProvider): string {
  return `envpilot_integration_state_${provider}`;
}

export function encodeOAuthState(state: IntegrationOAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthState(value: string): IntegrationOAuthState | null {
  if (!value || value.length > 1_024) return null;
  try {
    return integrationOAuthStateSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString())
    );
  } catch {
    return null;
  }
}
