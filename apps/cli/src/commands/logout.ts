import { Command } from "commander";
import { success, info } from "../lib/ui.js";
import {
  revokeDeviceSession,
  revokeDeviceSessionForAccount,
} from "../lib/api.js";
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
        const revocations: Promise<void>[] = [];

        for (const account of accounts) {
          if (account.sessionId) {
            revocations.push(
              revokeDeviceSessionForAccount(account, account.sessionId)
            );
          }
        }

        await Promise.all(revocations);

        for (const account of accounts) {
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
