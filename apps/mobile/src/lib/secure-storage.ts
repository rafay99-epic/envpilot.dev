import * as SecureStore from "expo-secure-store";

const KEYS = {
  ACCESS_TOKEN: "envpilot_access_token",
  REFRESH_TOKEN: "envpilot_refresh_token",
  USER_ID: "envpilot_user_id",
  USER_EMAIL: "envpilot_user_email",
  USER_NAME: "envpilot_user_name",
  ACTIVE_ORG_ID: "envpilot_active_org_id",
  DEVICE_ID: "envpilot_device_id",
} as const;

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

export async function setTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refreshToken),
  ]);
}

export async function setUser(user: {
  id: string;
  email: string;
  name?: string;
}): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.USER_ID, user.id),
    SecureStore.setItemAsync(KEYS.USER_EMAIL, user.email),
    user.name
      ? SecureStore.setItemAsync(KEYS.USER_NAME, user.name)
      : Promise.resolve(),
  ]);
}

export async function getUser(): Promise<{
  id: string;
  email: string;
  name?: string;
} | null> {
  const [id, email, name] = await Promise.all([
    SecureStore.getItemAsync(KEYS.USER_ID),
    SecureStore.getItemAsync(KEYS.USER_EMAIL),
    SecureStore.getItemAsync(KEYS.USER_NAME),
  ]);
  if (!id || !email) return null;
  return { id, email, name: name ?? undefined };
}

export async function setActiveOrgId(orgId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACTIVE_ORG_ID, orgId);
}

export async function getActiveOrgId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACTIVE_ORG_ID);
}

export async function getDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.DEVICE_ID);
}

export async function setDeviceId(deviceId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.DEVICE_ID, deviceId);
}

export async function setCodeVerifier(verifier: string): Promise<void> {
  await SecureStore.setItemAsync("envpilot_code_verifier", verifier);
}

export async function getCodeVerifier(): Promise<string | null> {
  return SecureStore.getItemAsync("envpilot_code_verifier");
}

export async function clearCodeVerifier(): Promise<void> {
  await SecureStore.deleteItemAsync("envpilot_code_verifier");
}

export async function clearAll(): Promise<void> {
  const keysToDelete = Object.entries(KEYS)
    .filter(([key]) => key !== "DEVICE_ID")
    .map(([, value]) => SecureStore.deleteItemAsync(value));
  await Promise.all(keysToDelete);
}
