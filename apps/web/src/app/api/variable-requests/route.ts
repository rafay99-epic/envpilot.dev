import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  getOrCreateConvexUser,
  checkOrganizationMembership,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { createSecret } from "@/lib/vault";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const listSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  status: z.enum(["pending", "approved", "rejected", "canceled"]).optional(),
});

const createRequestSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .max(100, "Key must be 100 characters or less")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Key must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
    ),
  value: z.string().min(1, "Value is required"),
  description: z.string().max(500).optional(),
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .min(1, "At least one environment is required"),
  projectId: z.string().min(1, "Project ID is required"),
  isSensitive: z.boolean().optional().default(false),
});

/**
 * GET /api/variable-requests?projectId=...&status=pending
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validation = listSchema.safeParse({
      projectId: searchParams.get("projectId") || "",
      status: searchParams.get("status") || undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { projectId, status } = validation.data;
    const convexUser = await getOrCreateConvexUser(convex, user);

    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">,
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId,
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requests = await convex.query(api.variableRequests.listForProject, {
      projectId: projectId as Id<"projects">,
      userId: convexUser._id,
      status,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch variable requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/variable-requests
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { key, value, description, environments, projectId, isSensitive } =
      validation.data;

    const convexUser = await getOrCreateConvexUser(convex, user);
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">,
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId,
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (membership.role !== "member") {
      return NextResponse.json(
        {
          error:
            "Only members can submit variable requests. Use direct variable creation instead.",
        },
        { status: 403 },
      );
    }

    const vaultResult = await createSecret(key, value, {
      organizationId,
      projectId,
    });

    const requestId = await convex.mutation(api.variableRequests.create, {
      key,
      vaultRef: vaultResult.id,
      description,
      environments,
      projectId: projectId as Id<"projects">,
      isSensitive,
      requestedBy: convexUser._id,
    });

    const createdRequest = await convex.query(api.variableRequests.getById, {
      requestId,
      userId: convexUser._id,
    });

    return NextResponse.json({ request: createdRequest }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create variable request";
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
