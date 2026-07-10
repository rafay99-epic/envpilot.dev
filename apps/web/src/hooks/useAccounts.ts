"use client";

import { useMutation } from "@tanstack/react-query";
import { useQuery, useMutation as useConvexMutation } from "convex/react";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { api } from "@/lib/api-client";
import {
  parseAccountVault,
  type AccountVaultPayload,
} from "@/lib/account-payload";
import { createLogger } from "@/lib/logger";

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
  userId: Id<"users"> | undefined
) {
  return useQuery(
    convexApi.features.accounts.queries.listWithAccess,
    projectId && userId ? { projectId, userId } : "skip"
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

/** Non-throwing check of whether the caller can manage this account's grants. */
export function useCanManageAccountPermissions(
  accountId: Id<"projectAccounts"> | undefined,
  userId: Id<"users"> | undefined
) {
  return useQuery(
    convexApi.features.permissions.accountPermissions.queries
      .canManageAccountPermissions,
    accountId && userId ? { accountId, userId } : "skip"
  );
}

/* ─── Permission mutations (direct Convex, no Vault) ────────────────── */

export function useGrantAccountPermission() {
  return useConvexMutation(
    convexApi.features.permissions.accountPermissions.mutations.grant
  );
}

export function useUpdateAccountPermission() {
  return useConvexMutation(
    convexApi.features.permissions.accountPermissions.mutations.update
  );
}

export function useRevokeAccountPermission() {
  return useConvexMutation(
    convexApi.features.permissions.accountPermissions.mutations.revoke
  );
}

/* ─── CRUD mutations (API routes → WorkOS Vault) ────────────────────── */

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
  return useMutation({
    mutationKey: ["accounts", "create"],
    mutationFn: (data: CreateAccountParams) =>
      api.post<AccountMutationResponse>("/api/accounts", data),
  });
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
  return useMutation({
    mutationKey: ["accounts", "update"],
    mutationFn: ({ id, ...data }: UpdateAccountParams) =>
      api.patch<AccountMutationResponse>(`/api/accounts/${id}`, data),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationKey: ["accounts", "delete"],
    mutationFn: (id: string) =>
      api.del<{ success: boolean }>(`/api/accounts/${id}`),
  });
}

/* ─── Reveal (Vault fetch + parse + audit) ──────────────────────────── */

interface RevealAccountArgs {
  accountId: Id<"projectAccounts">;
  vaultRef: string;
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

  return async ({
    accountId,
    vaultRef,
    organizationId,
    userId,
  }: RevealAccountArgs): Promise<AccountVaultPayload | null> => {
    try {
      const res = await fetch(
        `/api/vault?vaultRef=${encodeURIComponent(vaultRef)}&organizationId=${encodeURIComponent(organizationId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to read account credentials");
      }
      const parsed = parseAccountVault(data.data.value);
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
