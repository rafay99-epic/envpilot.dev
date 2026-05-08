import * as AuthSession from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { API_URL, APP_SCHEME } from "@/lib/constants";
import * as storage from "@/lib/secure-storage";
import type { MobileAuthResponse } from "@/lib/types";

const WORKOS_AUTH_URL = "https://api.workos.com/user_management/authorize";
const WORKOS_CLIENT_ID = process.env.EXPO_PUBLIC_WORKOS_CLIENT_ID || "";

export const redirectUri = AuthSession.makeRedirectUri({
  scheme: APP_SCHEME,
  path: "callback",
});

const CODE_VERIFIER_KEY = "envpilot_code_verifier";

function generateCodeVerifier(): string {
  const bytes = Crypto.getRandomBytes(32);
  return bytes
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "")
    .slice(0, 64);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
  );
  const bytes = new Uint8Array(
    digest.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function getOAuthURL(): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  await storage.setCodeVerifier(codeVerifier);

  return (
    `${WORKOS_AUTH_URL}?` +
    new URLSearchParams({
      client_id: WORKOS_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      provider: "authkit",
    }).toString()
  );
}

async function getDeviceId(): Promise<string> {
  let deviceId = await storage.getDeviceId();
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await storage.setDeviceId(deviceId);
  }
  return deviceId;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<MobileAuthResponse> {
  const codeVerifier = await storage.getCodeVerifier();
  if (!codeVerifier) throw new Error("Missing code verifier");

  const deviceId = await getDeviceId();
  const deviceName = Device.deviceName ?? Device.modelName ?? "Mobile Device";
  const platform = Platform.OS === "android" ? "android" : "ios";

  const url = `${API_URL}/api/mobile/auth?action=callback`;
  const body = {
    code,
    codeVerifier,
    redirectUri,
    deviceId,
    deviceName,
    platform,
  };

  if (__DEV__) {
    console.log("[Auth] POST", url);
    console.log("[Auth] redirectUri:", redirectUri);
    console.log("[Auth] code:", code.slice(0, 10) + "...");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (__DEV__) {
    console.log("[Auth] Response status:", response.status);
  }

  if (!response.ok) {
    const text = await response.text();
    if (__DEV__) console.log("[Auth] Error response body:", text.slice(0, 500));
    let errorMessage = "Authentication failed";
    try {
      const parsed = JSON.parse(text);
      errorMessage = parsed.error || errorMessage;
    } catch {
      errorMessage = `Server returned ${response.status}: ${text.slice(0, 100)}`;
    }
    throw new Error(errorMessage);
  }

  const data: MobileAuthResponse = await response.json();
  await storage.setTokens(data.accessToken, data.refreshToken);
  await storage.clearCodeVerifier();

  return data;
}

export async function refreshAccessToken(): Promise<MobileAuthResponse | null> {
  const refreshToken = await storage.getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_URL}/api/mobile/auth?action=refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;

  const data: MobileAuthResponse = await response.json();
  await storage.setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function revokeToken(): Promise<void> {
  const accessToken = await storage.getAccessToken();
  if (!accessToken) return;

  await fetch(`${API_URL}/api/mobile/auth?action=revoke`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  }).catch(() => {});

  await storage.clearAll();
}
