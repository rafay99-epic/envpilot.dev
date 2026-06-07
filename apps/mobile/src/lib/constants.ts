export const API_URL =
  process.env.EXPO_PUBLIC_APP_URL || "https://www.envpilot.dev";

const rawConvexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!rawConvexUrl) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is required. Add it to .env.local at the monorepo root.",
  );
}
export const CONVEX_URL = rawConvexUrl;

export const APP_SCHEME = "envpilot";
