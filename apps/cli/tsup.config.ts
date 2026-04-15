import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  define: {
    __CLI_SENTRY_DSN__: JSON.stringify(process.env.SENTRY_CLI_DSN || ""),
    __CLI_VERSION__: JSON.stringify(process.env.npm_package_version || "0.0.0"),
  },
});
