import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { defineConfig } from "tsup";

// Read the version straight from package.json so the built binary always
// carries the correct version, independent of how the build was invoked.
// Relying on process.env.npm_package_version is fragile: it is only populated
// when the build runs through an npm/bun lifecycle script and otherwise falls
// back to "0.0.0", which breaks `--version` and makes the update checker
// always report "update available".
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  define: {
    __CLI_SENTRY_DSN__: JSON.stringify(process.env.SENTRY_CLI_DSN || ""),
    __CLI_VERSION__: JSON.stringify(version),
  },
});
