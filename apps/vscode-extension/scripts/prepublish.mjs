// vsce's "vscode:prepublish" hook. In CI the release build already ran in
// the step shell (where the embed env provably exists — same pattern as the
// CLI job); EXT_PREBUILT=1 tells us to keep that dist instead of rebuilding
// inside vsce's spawned npm chain, where the env did not reliably survive.
import { execSync } from "node:child_process";

if (process.env.EXT_PREBUILT === "1") {
  console.log(
    "EXT_PREBUILT=1 — dist was built by the CI step; skipping rebuild."
  );
  process.exit(0);
}
execSync("npm run package", { stdio: "inherit" });
