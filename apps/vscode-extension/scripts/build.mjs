import * as esbuild from "esbuild";

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");

const serverUrl =
  process.env.ENVPILOT_SERVER_URL ||
  (isWatch ? "http://localhost:3000" : "https://www.envpilot.dev");

const define = {
  ...(serverUrl && {
    __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl),
  }),
  __WORKOS_CLIENT_ID__: JSON.stringify(process.env.WORKOS_CLIENT_ID || ""),
  __CONVEX_URL__: JSON.stringify(process.env.NEXT_PUBLIC_CONVEX_URL || ""),
  __EXTENSION_SENTRY_DSN__: JSON.stringify(
    process.env.SENTRY_EXTENSION_DSN || ""
  ),
  __EXTENSION_VERSION__: JSON.stringify(
    process.env.npm_package_version || "0.0.0"
  ),
};

const shared = {
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcemap: true,
  minify: isMinify,
  define,
};

const extensionOptions = {
  ...shared,
  entryPoints: ["./src/extension.ts"],
  outfile: "dist/extension.js",
  external: ["vscode", "./sentry.js"],
};

const sentryOptions = {
  ...shared,
  entryPoints: ["./src/utils/sentryRuntime.ts"],
  outfile: "dist/sentry.js",
  external: ["vscode"],
};

const uninstallOptions = {
  ...shared,
  entryPoints: ["./src/uninstall.ts"],
  outfile: "dist/uninstall.js",
};

if (isWatch) {
  const extCtx = await esbuild.context(extensionOptions);
  const sentryCtx = await esbuild.context(sentryOptions);
  const uninstallCtx = await esbuild.context(uninstallOptions);
  await Promise.all([extCtx.watch(), sentryCtx.watch(), uninstallCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(sentryOptions),
    esbuild.build(uninstallOptions),
  ]);
}
