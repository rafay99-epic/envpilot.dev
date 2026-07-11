import * as esbuild from "esbuild";

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");

// ENVPILOT_SERVER_URL always wins. Otherwise a watch build (dev — `bun run
// dev`) defaults to the local server, while a one-shot/minified build (prod
// packaging) defaults to production. This keeps `bun run dev` pointed at
// localhost without anyone having to remember to set the env var.
const serverUrl =
  process.env.ENVPILOT_SERVER_URL ||
  (isWatch ? "http://localhost:3000" : "https://www.envpilot.dev");

const define = {
  ...(serverUrl && {
    __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl),
  }),
  // WorkOS AuthKit device-flow client id (public) and the Convex deployment
  // URL, baked in at build time from the same env vars the web app uses so a
  // single build environment configures every surface. See utils/config.ts for
  // the runtime consumers (getWorkosClientId / getConvexUrl).
  __WORKOS_CLIENT_ID__: JSON.stringify(process.env.WORKOS_CLIENT_ID || ""),
  __CONVEX_URL__: JSON.stringify(process.env.NEXT_PUBLIC_CONVEX_URL || ""),
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

/**
 * `vscode:uninstall` hook bundle — plain node script (no vscode API) that
 * purges synced .env files after the extension is removed.
 * @type {import('esbuild').BuildOptions}
 */
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
