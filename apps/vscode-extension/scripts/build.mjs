import * as esbuild from "esbuild";

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");

const serverUrl =
  process.env.ENVPILOT_SERVER_URL || "https://www.envpilot.dev";

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ["./src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  sourcemap: isWatch,
  minify: isMinify,
  define: {
    ...(serverUrl && {
      __DEFAULT_SERVER_URL__: JSON.stringify(serverUrl),
    }),
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
}
