// vsce's "vscode:prepublish" hook. In CI the release build already ran in
// the step shell (where the embed env provably exists); the CI step drops a
// .prebuilt marker FILE next to package.json to say "keep this dist".
// A file — not an env var — because vsce's spawned npm chain scrubs env on
// the CI image (that's the very bug that shipped empty client ids).
import { existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const marker = fileURLToPath(new URL("../.prebuilt", import.meta.url));

if (process.env.EXT_PREBUILT === "1" || existsSync(marker)) {
  rmSync(marker, { force: true }); // one-shot: never leaks into a later local build
  console.log(
    "prebuilt marker found — keeping the CI-built dist, skipping rebuild."
  );
  process.exit(0);
}
execSync("npm run package", { stdio: "inherit" });
