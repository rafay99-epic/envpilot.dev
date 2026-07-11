/**
 * `vscode:uninstall` hook (see package.json "scripts"). VS Code runs this as
 * a plain node script — NO vscode API — on the first launch after the
 * extension is fully uninstalled (it does NOT run on updates or reloads).
 *
 * Purges every synced .env file recorded in the managed-files manifest so
 * plaintext secrets don't outlive the extension. Files hand-edited since the
 * last sync are spared (sha256 guard in purgeManagedFiles). Must never throw:
 * a failure here surfaces as a VS Code startup error.
 */
import { purgeManagedFiles } from "./utils/managedFiles";

purgeManagedFiles()
  .then(({ deleted, spared }) => {
    console.log(
      `[Envpilot] Uninstall cleanup: removed ${deleted} synced .env file(s), spared ${spared} locally modified file(s).`
    );
  })
  .catch(() => {
    // Best-effort only.
  });
