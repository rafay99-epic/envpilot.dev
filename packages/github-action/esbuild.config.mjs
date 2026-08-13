// Bundles the action into a single committed dist/index.js. GitHub Actions
// runs the action straight out of the repo (or the published dist/ in the
// public mirror) — no install step, no node_modules — so the bundle must be
// fully self-contained. CJS output because Node's `node24` action runtime
// invokes `dist/index.js` directly with `require`, not via package "type".
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: "dist/index.js",
  sourcemap: false,
  minify: !watch,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
