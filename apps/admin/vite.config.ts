import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // Root .env.local (envDir) doesn't use the VITE_ prefix for WorkOS; map the
  // existing WORKOS_CLIENT_ID through so local dev + CI need no duplicate var.
  const env = loadEnv(mode, path.resolve(__dirname, "../../"), "");
  const workosClientId =
    env.VITE_WORKOS_CLIENT_ID ||
    env.WORKOS_CLIENT_ID ||
    process.env.WORKOS_CLIENT_ID ||
    "";

  return {
    plugins: [
      TanStackRouterVite({ quoteStyle: "double" }),
      react(),
      tailwindcss(),
    ],
    envDir: "../../",
    define: {
      "import.meta.env.VITE_WORKOS_CLIENT_ID": JSON.stringify(workosClientId),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@convex": path.resolve(__dirname, "../../convex"),
      },
    },
  };
});
