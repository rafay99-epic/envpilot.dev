import { Command } from "commander";
import { success, info } from "../lib/ui.js";
import { revokeDeviceSession } from "../lib/api.js";
import {
  clearAuth,
  isAuthenticated,
  getActiveAccount,
  listAccounts,
  removeAccount,
  setActiveAccount,
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
          // Best-effort remote revoke. Each account is a distinct WorkOS
          // identity, so authenticate as it (setActive) before revoking.
          if (account.sessionId) {
            setActiveAccount(account.id);
            await revokeDeviceSession(account.sessionId);
          }
          removeAccount(account.id);
        }

        // clearAuth() also purges the run cache; there's no active account
        // left, but calling it reuses the same cache-purge path.
        clearAuth();

        success(`Logged out of all ${accounts.length} accounts.`);
        return;
      }

      const activeAccount = getActiveAccount();

      // Best-effort remote sign-out: revoke the WorkOS session + device record.
      if (activeAccount?.sessionId) {
        await revokeDeviceSession(activeAccount.sessionId);
      }

      // Clear local config (removes the active account, purges run cache).
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
