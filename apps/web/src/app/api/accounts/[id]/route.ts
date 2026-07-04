import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { reportApiError } from "@/lib/api-errors";
import { readSecret, updateSecret } from "@/lib/vault";
import { serializeAccountVault, websiteUrlSchema } from "@/lib/account-payload";

const updateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  // An empty string clears the stored website URL (see accounts.update).
  websiteUrl: websiteUrlSchema.or(z.literal("")).optional(),
  username: z.string().min(1).max(320).optional(),
  password: z.string().min(1).max(512).optional(),
  description: z.string().max(500).optional(),
  environments: z.array(z.string().min(1)).min(1).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Map a thrown Convex/route error to the appropriate HTTP status + shape.
 * Mirrors the classification used by PATCH /api/variables/[id].
 */
function errorResponseFor(
  error: unknown,
  fallbackMessage: string,
  route?: string
) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("not found") || message.includes("Not found")) {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (
    message.includes("Insufficient") ||
    message.includes("permission") ||
    message.includes("No access") ||
    message.includes("not enabled")
  ) {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (message.includes("limit reached")) {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  if (route) {
    reportApiError(error, route);
  }

  return NextResponse.json(
    { error: fallbackMessage, details: message },
    { status: 500 }
  );
}

/**
 * PATCH /api/accounts/[id] - Update a shared account's metadata and/or
 * credentials.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const validation = updateAccountSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const convexUser = await getOrCreateConvexUser(convex, user);

    const { name, websiteUrl, username, password, description, environments } =
      validation.data;

    // Reject partial credential updates: a lone username or password is
    // ambiguous (it would be silently ignored below), which hides client bugs.
    // Credentials must be rotated as a pair.
    if ((username === undefined) !== (password === undefined)) {
      return NextResponse.json(
        {
          error:
            "username and password must be provided together to change credentials",
        },
        { status: 400 }
      );
    }

    // Credentials are only rewritten in Vault when BOTH username and password
    // are present together — a partial credential update would corrupt the
    // JSON payload stored in Vault.
    const credentialsChanged = username !== undefined && password !== undefined;

    // Fetch the account via a Convex query first — this both resolves the
    // vaultRef and verifies the caller's access server-side (throws
    // "Account not found" / "Insufficient permissions" otherwise). When the
    // request will rotate credentials we require WRITE access here so the
    // request is rejected BEFORE the Vault write; metadata-only PATCHes stay
    // on READ (the mutation still enforces write, and no Vault write happens).
    const account = await convex.query(api.accounts.get, {
      accountId: id as Id<"projectAccounts">,
      userId: convexUser._id,
      minimumAccess: credentialsChanged ? "write" : "read",
    });

    // Vault is written before the Convex metadata/version commit, so a failure
    // in the mutation (e.g. environment-scope validation) would otherwise leave
    // the credentials changed in Vault without a matching Convex version/audit
    // entry. Snapshot the previous value first and roll it back if the mutation
    // throws, keeping Vault and Convex consistent with the HTTP result.
    let previousVaultValue: string | null = null;
    if (credentialsChanged) {
      previousVaultValue = await readSecret(account.vaultRef);
      // In-place update: the same vaultRef is reused (updateSecret overwrites
      // the existing Vault object), so Convex never needs a new vaultRef.
      await updateSecret(
        account.vaultRef,
        serializeAccountVault({ username, password })
      );
    }

    // No role gate here: owners/project managers/team leads can update, and
    // developers holding a write grant on this account can too. The Convex
    // mutation enforces the full access rules (getAccountAccess).
    try {
      await convex.mutation(api.accounts.update, {
        accountId: id as Id<"projectAccounts">,
        userId: convexUser._id,
        name,
        websiteUrl,
        description,
        environments,
        credentialsChanged,
      });
    } catch (mutationError) {
      // Compensating rollback: restore the prior credentials so a failed
      // request does not leave the account's Vault value mutated.
      if (previousVaultValue !== null) {
        try {
          await updateSecret(account.vaultRef, previousVaultValue);
        } catch (rollbackError) {
          Sentry.captureException(rollbackError, {
            tags: { source: "accounts-patch", action: "vault-rollback" },
            extra: { vaultRef: account.vaultRef },
          });
        }
      }
      throw mutationError;
    }

    const updatedAccount = await convex.query(api.accounts.get, {
      accountId: id as Id<"projectAccounts">,
      userId: convexUser._id,
    });

    return NextResponse.json({ account: updatedAccount });
  } catch (error) {
    console.error("[PATCH /api/accounts/[id]]", error);
    return errorResponseFor(
      error,
      "Failed to update account",
      "PATCH /api/accounts/[id]"
    );
  }
}

/**
 * DELETE /api/accounts/[id] - Soft delete a shared account.
 * Convex-side soft delete only — the WorkOS Vault object is left intact,
 * matching the variable delete flow (no deleteSecret call).
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const convexUser = await getOrCreateConvexUser(convex, user);

    // Authorization (role-only, no grant fallback — parity with
    // variables.remove) is enforced entirely by the Convex mutation.
    await convex.mutation(api.accounts.remove, {
      accountId: id as Id<"projectAccounts">,
      deletedBy: convexUser._id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/accounts/[id]]", error);
    return errorResponseFor(
      error,
      "Failed to delete account",
      "DELETE /api/accounts/[id]"
    );
  }
}
