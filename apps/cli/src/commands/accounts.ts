import { Command } from "commander";
import chalk from "chalk";
import { success, error, table, blank } from "../lib/ui.js";
import {
  listAccounts,
  getActiveAccountId,
  setActiveAccount,
  removeAccount,
} from "../lib/config.js";
import type { Account } from "../types/index.js";
import { handleError } from "../lib/errors.js";

/**
 * Resolve a user-provided identifier against the known accounts, matching on
 * account id (exact) or user email (case-insensitive). Pure and side-effect
 * free so it can be exercised directly in tests without touching the real
 * on-disk config store.
 */
export function resolveAccount(
  accounts: Account[],
  identifier: string
): Account | undefined {
  const normalized = identifier.trim().toLowerCase();
  return accounts.find(
    (account) =>
      account.id === identifier ||
      account.user.email.toLowerCase() === normalized
  );
}

function listAvailableEmails(accounts: Account[]): void {
  console.log();
  console.log("Available accounts:");
  for (const account of accounts) {
    console.log(`  ${account.user.email}`);
  }
}

function printAccountsList(): void {
  const accounts = listAccounts();
  const activeId = getActiveAccountId();

  if (accounts.length === 0) {
    console.log("No accounts. Run `envpilot login`.");
    return;
  }

  table(
    accounts.map((account) => ({
      active: account.id === activeId ? chalk.green("●") : "",
      email: account.user.email,
      name: account.user.name ?? "",
      organization: account.activeOrganizationId ?? "",
    })),
    [
      { key: "active", header: "" },
      { key: "email", header: "Email" },
      { key: "name", header: "Name" },
      { key: "organization", header: "Active Org" },
    ]
  );

  blank();
  if (accounts.length === 1) {
    console.log(chalk.dim("1 account (log in again to add another)."));
  } else {
    console.log(chalk.dim(`${accounts.length} accounts.`));
  }
}

function switchAccount(identifier: string): void {
  const accounts = listAccounts();
  const target = resolveAccount(accounts, identifier);

  if (!target) {
    error(`Account not found: ${identifier}`);
    listAvailableEmails(accounts);
    process.exit(1);
  }

  setActiveAccount(target.id);
  success(`Switched to ${target.user.email}.`);
}

function removeAccountByIdentifier(identifier: string): void {
  const accounts = listAccounts();
  const target = resolveAccount(accounts, identifier);

  if (!target) {
    error(`Account not found: ${identifier}`);
    listAvailableEmails(accounts);
    process.exit(1);
  }

  const result = removeAccount(target.id);
  success(`Removed ${target.user.email}.`);

  if (result.removedActive) {
    if (result.newActiveId) {
      const remaining = listAccounts();
      const newActive = remaining.find((a) => a.id === result.newActiveId);
      console.log(
        chalk.dim(`Now active: ${newActive?.user.email ?? result.newActiveId}`)
      );
    } else {
      console.log(chalk.dim("No accounts remaining."));
    }
  }
}

export const accountsCommand = new Command("accounts")
  .description("List and manage authenticated accounts")
  .action(async () => {
    try {
      printAccountsList();
    } catch (err) {
      await handleError(err);
    }
  });

accountsCommand
  .command("list")
  .description("List all authenticated accounts")
  .action(async () => {
    try {
      printAccountsList();
    } catch (err) {
      await handleError(err);
    }
  });

accountsCommand
  .command("switch")
  .description("Switch the active account")
  .argument("<identifier>", "Account id or email")
  .action(async (identifier: string) => {
    try {
      switchAccount(identifier);
    } catch (err) {
      await handleError(err);
    }
  });

accountsCommand
  .command("remove")
  .description("Remove an account")
  .argument("<identifier>", "Account id or email")
  .action(async (identifier: string) => {
    try {
      removeAccountByIdentifier(identifier);
    } catch (err) {
      await handleError(err);
    }
  });
