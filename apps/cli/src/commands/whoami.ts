import { Command } from "commander";
import chalk from "chalk";
import { createAPIClient } from "../lib/api.js";
import {
  getApiUrl,
  getActiveOrganizationId,
  getActiveProjectId,
  getUser,
  getUnifiedRole,
  isAuthenticated,
} from "../lib/config.js";
import { formatRoleLabel } from "../lib/roles.js";
import {
  readProjectConfigV2,
  getActiveProject,
} from "../lib/project-config.js";
import { handleError, notAuthenticated } from "../lib/errors.js";
import { header, keyValue, blank } from "../lib/ui.js";

export const whoamiCommand = new Command("whoami")
  .description("Show the current authenticated user and active CLI context")
  .action(async () => {
    try {
      if (!isAuthenticated()) {
        throw notAuthenticated();
      }

      const api = createAPIClient();
      const remoteUser = await api.getCurrentUser();
      const localUser = getUser();
      const linkedConfig = readProjectConfigV2();
      const activeProject = linkedConfig
        ? getActiveProject(linkedConfig)
        : null;

      header("Current Session");
      blank();
      keyValue([
        ["Email", remoteUser.email],
        ["Name", remoteUser.name || localUser?.name],
        ["API URL", getApiUrl()],
        ["Active Organization", getActiveOrganizationId()],
        ["Org Role", formatRoleLabel(getUnifiedRole())],
        ["Active Project", getActiveProjectId()],
        [
          "Linked Project",
          activeProject?.projectName || activeProject?.projectId,
        ],
        ["Environment", activeProject?.environment],
      ]);
      blank();
      console.log(chalk.dim("Token verified against the CLI auth endpoint."));
    } catch (err) {
      await handleError(err);
    }
  });
