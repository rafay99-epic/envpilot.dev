import { Command } from "commander";
import { success, info } from "../lib/ui.js";
import { createAPIClient } from "../lib/api.js";
import { clearAuth, isAuthenticated, getUser } from "../lib/config.js";
import { handleError } from "../lib/errors.js";

export const logoutCommand = new Command("logout")
  .description("Log out from Envpilot")
  .action(async () => {
    try {
      if (!isAuthenticated()) {
        info("You are not logged in.");
        return;
      }

      const user = getUser();
      const api = createAPIClient();

      // Revoke token on server
      try {
        await api.post("/api/cli/auth?action=revoke", {});
      } catch {
        // Ignore errors during revocation - we'll clear local config anyway
      }

      // Clear local config
      clearAuth();

      success(`Logged out${user?.email ? ` from ${user.email}` : ""}`);
    } catch (err) {
      await handleError(err);
    }
  });
