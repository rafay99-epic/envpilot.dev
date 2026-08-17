"use client";

import {
  useQuery,
  useAction,
  useMutation as useConvexMutation,
} from "convex/react";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  parseAccountVault,
  type AccountVaultPayload,
} from "@/lib/account-payload";
import { createLogger } from "@/lib/logger";
import { useRevealSecret } from "./useRevealSecret";

const log = createLogger("hooks/useAccounts");

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface Account {
  _id: Id<"projectAccounts">;
  name: string;
  websiteUrl?: string;
  description?: string;
  environments: string[];
  version: number;
  createdAt: number;
  updatedAt: number;
  vaultRef?: string;
  hasAccess: boolean;
  permission?: "admin" | "write" | "read" | null;
  roleAccess?: boolean;
  canManagePermissions?: boolean;
}

/* ─── Reads (direct Convex, real-time) ──────────────────────────────── */

/** List accounts in a project with per-row access annotations. */
export function useAccounts(
  projectId: Id<"projects"> | undefined,
  // Retained as a readiness gate only — the query derives identity from the
  // authed JWT server-side, never from a client-supplied userId.
  userId: Id<"users"> | undefined
) {
  return useQuery(
    convexApi.features.accounts.queries.listWithAccess,
    projectId && userId ? { projectId } : "skip"
  ) as Account[] | undefined;
}

/** Active internal permission grants for an account (with revoke targets). */
export function useAccountGrants(accountId: Id<"projectAccounts"> | undefined) {
  return useQuery(
    convexApi.features.permissions.accountPermissions.queries.getForAccount,
    accountId ? { accountId } : "skip"
  );
}

/** Org members eligible to receive a grant on this account. */
export function useAssignableAccountMembers(
  accountId: Id<"projectAccounts"> | undefined,
  requestingUserId: Id<"users"> | undefined
) {
  return useQuery(
    convexApi.features.permissions.accountPermissions.queries
      .getAssignableMembers,
    accountId && requestingUserId ? { accountId, requestingUserId } : "skip"
  );
}

/* ─── Permission mutations (direct Convex, no Vault) ────────────────── */

export function useGrantAccountPermission() {
  return useConvexMutation(
    convexApi.features.permissions.accountPermissions.mutations.grant
  );
}

export function useRevokeAccountPermission() {
  return useConvexMutation(
    convexApi.features.permissions.accountPermissions.mutations.revoke
  );
}

/* ─── CRUD mutations (direct Convex → WorkOS Vault) ─────────────────── */
//
// These posted to /api/accounts*, which read the AuthKit session and then
// called the exact Convex actions used here. The `mutateAsync` shape is kept
// so call sites did not have to change their control flow.

interface CreateAccountParams {
  organizationId: string;
  projectId: string;
  name: string;
  websiteUrl?: string;
  username: string;
  password: string;
  description?: string;
  environments: string[];
}

interface AccountMutationResponse {
  account?: { _id: string };
  id?: string;
  success?: boolean;
}

export function useCreateAccount() {
  const create = useAction(
    convexApi.features.accounts.values.createWithCredentials
  );
  return {
    mutateAsync: async ({
      organizationId: _organizationId,
      projectId,
      ...data
    }: CreateAccountParams): Promise<AccountMutationResponse> => {
      // organizationId was only ever used by the route to re-check membership;
      // the action derives it from the project it authorizes against.
      const { accountId } = await create({
        ...data,
        projectId: projectId as Id<"projects">,
      });
      return { id: accountId, success: true };
    },
  };
}

interface UpdateAccountParams {
  id: string;
  name?: string;
  websiteUrl?: string;
  description?: string;
  environments?: string[];
  // Both must be present together to rotate credentials.
  username?: string;
  password?: string;
}

export function useUpdateAccount() {
  const update = useAction(
    convexApi.features.accounts.values.updateWithCredentials
  );
  return {
    mutateAsync: async ({
      id,
      ...data
    }: UpdateAccountParams): Promise<AccountMutationResponse> => {
      const { accountId } = await update({
        ...data,
        accountId: id as Id<"projectAccounts">,
      });
      return { id: accountId, success: true };
    },
  };
}

export function useDeleteAccount() {
  const remove = useConvexMutation(
    convexApi.features.accounts.mutations.remove
  );
  return {
    // `deletedBy` is passed in rather than resolved here: the caller already
    // holds convexUserId, and re-deriving it inside the hook would add a
    // second subscription that can lag behind the page's own.
    mutateAsync: async ({
      accountId,
      deletedBy,
    }: {
      accountId: string;
      deletedBy: Id<"users">;
    }): Promise<{ success: boolean }> => {
      await remove({
        accountId: accountId as Id<"projectAccounts">,
        deletedBy,
      });
      return { success: true };
    },
  };
}

/* ─── Reveal (Vault fetch + parse + audit) ──────────────────────────── */

interface RevealAccountArgs {
  accountId: Id<"projectAccounts">;
  vaultRef: string;
  /** Retained for log context only — authorization is by resource, not org. */
  organizationId: string;
  userId: Id<"users">;
}

/**
 * Returns a reveal function that fetches an account's credentials from the
 * Vault, parses the JSON payload, and records an `account.accessed` audit log.
 * Resolves to `{ username, password }` or `null` on failure.
 */
export function useRevealAccount() {
  const logAccess = useConvexMutation(
    convexApi.features.accounts.mutations.logAccess
  );
  const revealSecret = useRevealSecret();

  return async ({
    accountId,
    vaultRef,
    organizationId,
    userId,
  }: RevealAccountArgs): Promise<AccountVaultPayload | null> => {
    try {
      const value = await revealSecret(vaultRef);
      const parsed = parseAccountVault(value);
      if (!parsed) {
        throw new Error("Account credentials are malformed");
      }

      // Fire-and-forget audit — never block the reveal on the log write.
      void logAccess({ accountId, accessedBy: userId }).catch((err) => {
        log.warn("account_log_access_failed", {
          accountId,
          reason: err instanceof Error ? err.message : "unknown_error",
        });
      });

      return parsed;
    } catch (err) {
      log.error("account_reveal_failed", { accountId, organizationId }, err);
      return null;
    }
  };
}
