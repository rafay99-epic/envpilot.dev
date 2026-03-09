import { z } from "zod";

// Environment variable validation schema
const envSchema = z.object({
  WORKOS_API_KEY: z.string().min(1, "WORKOS_API_KEY is required"),
  WORKOS_CLIENT_ID: z.string().min(1, "WORKOS_CLIENT_ID is required"),
  WORKOS_COOKIE_PASSWORD: z
    .string()
    .min(32, "WORKOS_COOKIE_PASSWORD must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  WORKOS_REDIRECT_URI: z.string().url().optional(),
});

// Validate environment variables on module load
function getEnvConfig() {
  const result = envSchema.safeParse({
    WORKOS_API_KEY: process.env.WORKOS_API_KEY,
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
    WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    WORKOS_REDIRECT_URI: process.env.WORKOS_REDIRECT_URI,
  });

  if (!result.success) {
    const errors = result.error.issues.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    console.error("Invalid WorkOS configuration:", errors.join(", "));

    // In development, throw a helpful error
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        `WorkOS configuration error:\n${errors.join("\n")}\n\nPlease check your .env.local file.`
      );
    }

    // In production, return partial config (will fail at runtime but allows build)
    return {
      WORKOS_API_KEY: process.env.WORKOS_API_KEY || "",
      WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID || "",
      WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD || "",
      NEXT_PUBLIC_APP_URL:
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      WORKOS_REDIRECT_URI: process.env.WORKOS_REDIRECT_URI,
    };
  }

  return result.data;
}

// Export validated config
export const authConfig = getEnvConfig();

// Auth-related route paths
export const AUTH_ROUTES = {
  SIGN_IN: "/sign-in",
  SIGN_UP: "/sign-up",
  CALLBACK: "/callback",
  SIGN_OUT: "/sign-out",
} as const;

// Protected route prefixes that require authentication
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/settings",
  "/api/protected",
] as const;

// Public routes that don't require authentication
export const PUBLIC_ROUTES = [
  "/",
  "/sign-in",
  "/sign-up",
  "/callback",
  "/api/health",
] as const;
