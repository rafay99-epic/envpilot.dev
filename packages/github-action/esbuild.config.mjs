import * as esbuild from "esbuild";

/** @type {import("esbuild").BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  // GitHub Actions expects CJS with `require()` support
  // The runner loads the file directly via `node dist/main/index.js`
  minify: false,
  sourcemap: true,
  // tree-shake unused code
  treeShaking: true,
  logLevel: "info",
};

// Bundle main entry point
await esbuild.build({
  ...shared,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main/index.js",
});

// Bundle post-job cleanup entry point
await esbuild.build({
  ...shared,
  entryPoints: ["src/post.ts"],
  outfile: "dist/post/index.js",
});

console.log("Build complete — dist/main/index.js, dist/post/index.js");
