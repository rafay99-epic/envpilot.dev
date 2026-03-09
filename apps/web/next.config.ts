import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    resolveAlias: {
      "@convex": path.resolve(import.meta.dirname!, "../../convex"),
    },
  },
};

export default nextConfig;
