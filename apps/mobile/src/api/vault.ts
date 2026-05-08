import { API_URL } from "@/lib/constants";
import * as storage from "@/lib/secure-storage";

export async function decryptValue(vaultRef: string): Promise<string | null> {
  const accessToken = await storage.getAccessToken();
  if (!accessToken) return null;

  const response = await fetch(`${API_URL}/api/mobile/vault/decrypt`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vaultRef }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.value ?? null;
}
