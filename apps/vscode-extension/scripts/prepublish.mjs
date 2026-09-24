import { existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const marker = fileURLToPath(new URL("../.prebuilt", import.meta.url));

if (process.env.EXT_PREBUILT === "1" || existsSync(marker)) {
  rmSync(marker, { force: true });
  console.log(
    "prebuilt marker found — keeping the CI-built dist, skipping rebuild."
  );
  process.exit(0);
}
execSync("npm run package", { stdio: "inherit" });
