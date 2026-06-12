import * as esbuild from "esbuild";

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");

const serverUrl = process.env.ENVPILOT_SERVER_URL || "https://www.envpilot.dev";

const define = {
  ...(serverUrl && {
    __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl),
  }),
  __EXTENSION_SENTRY_DSN__: JSON.stringify(
    process.env.SENTRY_EXTENSION_DSN || ""
  ),
  __EXTENSION_VERSION__: JSON.stringify(
    process.env.npm_package_version || "0.0.0"
  ),
};

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcemap: true,
  minify: isMinify,
  define,
};

/**
 * Main extension bundle. "./sentry.js" is kept external so the heavy
 * @sentry/node dependency lives in its own chunk (built below) and is
 * only required lazily at runtime — it must not slow down activation.
 * @type {import('esbuild').BuildOptions}
 */
const extensionOptions = {
  ...shared,
  entryPoints: ["./src/extension.ts"],
  outfile: "dist/extension.js",
  external: ["vscode", "./sentry.js"],
};

/** @type {import('esbuild').BuildOptions} */
const sentryOptions = {
  ...shared,
  entryPoints: ["./src/utils/sentryRuntime.ts"],
  outfile: "dist/sentry.js",
  external: ["vscode"],
};

if (isWatch) {
  const extCtx = await esbuild.context(extensionOptions);
  const sentryCtx = await esbuild.context(sentryOptions);
  await Promise.all([extCtx.watch(), sentryCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(sentryOptions),
  ]);
}
