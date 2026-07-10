import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError, handleApiError } from "@/lib/api-errors";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { websiteUrlSchema } from "@/lib/account-payload";

export const createAccountSchema = z.object({
  // organizationId is intentionally NOT accepted here — the server resolves the
  // owning org from projectId (see getProjectOrganization below) to prevent
  // cross-tenant key confusion, so a client-supplied value would be ignored.
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
    const { user, accessToken } = await withAuth();

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
      createAuthedConvexClient(accessToken!),
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Unified RBAC: assigned developers create accounts directly (they get an
    // auto write-grant on accounts they create). The composed Convex action
    // encrypts the credentials into WorkOS Vault (deriving the caller's identity
    // from the JWT) and inserts the account with the ref, rolling the vault
    // object back if the insert rejects. Authorization — including project
    // assignment + environment scoping + tier gating — is enforced there.
    const { accountId } = await createAuthedConvexClient(accessToken!).action(
      api.features.accounts.values.createWithCredentials,
      {
        projectId: projectId as Id<"projects">,
        name,
        websiteUrl,
        username,
        password,
        description,
        environments,
      }
    );

    const account = await convex.query(api.features.accounts.queries.get, {
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
