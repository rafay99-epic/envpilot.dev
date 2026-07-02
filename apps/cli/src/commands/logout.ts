import { Command } from "commander";
import { success, info } from "../lib/ui.js";
import { APIClient, createAPIClient } from "../lib/api.js";
import {
  clearAuth,
  isAuthenticated,
  getActiveAccount,
  listAccounts,
  removeAccount,
} from "../lib/config.js";
import { handleError } from "../lib/errors.js";

export const logoutCommand = new Command("logout")
  .description("Log out from Envpilot")
  .option("--all", "Log out of every authenticated account")
  .action(async (options) => {
    try {
      if (!isAuthenticated()) {
        info("You are not logged in.");
        return;
      }

      if (options.all) {
        const accounts = listAccounts();

        for (const account of accounts) {
          try {
            const api = new APIClient({ accessToken: account.accessToken });
            await api.post("/api/cli/auth?action=revoke", {});
          } catch {
            // Ignore errors during revocation - we'll clear local config anyway
          }
          removeAccount(account.id);
        }

        // clearAuth() also purges the run cache; there's no active account
        // left at this point, but calling it is a cheap, safe way to reuse
        // the same cache-purge path as a single-account logout.
        clearAuth();

        success(`Logged out of all ${accounts.length} accounts.`);
        return;
      }

      const activeAccount = getActiveAccount();
      const api = createAPIClient();

      // Revoke token on server
      try {
        await api.post("/api/cli/auth?action=revoke", {});
      } catch {
        // Ignore errors during revocation - we'll clear local config anyway
      }

      // Clear local config (removes the active account, purges run cache)
      const { newActiveId } = clearAuth();

      success(
        `Logged out${activeAccount?.user.email ? ` ${activeAccount.user.email}` : ""}.`
      );

      if (newActiveId) {
        const remaining = listAccounts();
        const newActive = remaining.find((a) => a.id === newActiveId);
        info(`Now active: ${newActive?.user.email ?? newActiveId}`);
      } else {
        info("No accounts remaining.");
      }
    } catch (err) {
      await handleError(err);
    }
  });
