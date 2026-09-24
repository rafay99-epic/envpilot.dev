import { purgeManagedFiles } from "./utils/managedFiles";

purgeManagedFiles()
  .then(({ deleted, spared }) => {
    console.log(
      `[Envpilot] Uninstall cleanup: removed ${deleted} synced .env file(s), spared ${spared} locally modified file(s).`
    );
  })
  .catch(() => {});
