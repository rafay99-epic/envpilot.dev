import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError, handleApiError } from "@/lib/api-errors";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { createSecret, deleteSecret } from "@/lib/vault";
import { serializeAccountVault, websiteUrlSchema } from "@/lib/account-payload";

export const createAccountSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  projectId: z.string().min(1, "Project ID is required"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(200, "Name must be 200 characters or less"),
  websiteUrl: websiteUrlSchema.optional(),
  username: z.string().min(1, "Username is required").max(320),
  password: z.string().min(1, "Password is required").max(512),
  description: z.string().max(500).optional(),
  environments: z
    .array(z.string().min(1))
    .min(1, "At least one environment is required"),
});

/**
 * POST /api/accounts - Create a new shared account (service login credential)
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createAccountSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const {
      projectId,
      name,
      websiteUrl,
      username,
      password,
      description,
      environments,
    } = validation.data;

    // Resolve the Convex user and the project's organization concurrently —
    // the two lookups are independent. The project's own organizationId is
    // authoritative for the Vault key context and Convex mutation — never the
    // client-supplied organizationId — to prevent cross-tenant key confusion.
    const [convexUser, { project, organizationId }] = await Promise.all([
      getOrCreateConvexUser(convex, user),
      getProjectOrganization(convex, projectId as Id<"projects">),
    ]);

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Encrypt the credentials in Vault first. Vault write happens before the
    // Convex mutation, matching the variable-create flow.
    const vaultResult = await createSecret(
      `account:${name}:${Date.now()}`,
      serializeAccountVault({ username, password }),
      {
        organizationId,
        projectId,
        environment: "account",
      }
    );
    const vaultRef = vaultResult.id;

    let accountId: Id<"projectAccounts">;
    try {
      // Unified RBAC: assigned developers create accounts directly (they get
      // an auto write-grant on accounts they create). Authorization —
      // including project assignment + environment scoping + tier gating —
      // is enforced by the Convex mutation.
      accountId = await convex.mutation(api.accounts.create, {
        projectId: projectId as Id<"projects">,
        createdBy: convexUser._id,
        name,
        websiteUrl,
        description,
        environments,
        vaultRef,
      });
    } catch (mutationError) {
      // Best-effort cleanup: the Convex insert failed after the Vault write
      // succeeded, so remove the now-orphaned encrypted credentials.
      // (Same pattern as shares/[token]/revoke's best-effort vault delete.)
      try {
        await deleteSecret(vaultRef);
      } catch (cleanupError) {
        Sentry.captureException(cleanupError, {
          tags: { source: "account-vault", action: "create-rollback" },
          extra: { vaultRef, organizationId, projectId },
        });
      }
      throw mutationError;
    }

    const account = await convex.query(api.accounts.get, {
      accountId,
      userId: convexUser._id,
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    const message = sanitizeConvexError(error);

    if (message.includes("limit reached") || message.includes("not enabled")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return handleApiError(error, "Failed to create account");
  }
}
