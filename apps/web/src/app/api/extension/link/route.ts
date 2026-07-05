import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import {
  checkOrganizationMembershipForToken,
  getProjectOrganization,
} from "@/lib/convex-helpers";
import { authenticateExtensionRequest } from "@/lib/extension-auth";
import { reportApiError } from "@/lib/api-errors";

const linkExtensionSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  deviceId: z.string().min(1, "Device ID is required"),
  deviceName: z.string().min(1, "Device name is required"),
  expiresInDays: z.number().min(1).max(365).optional().default(30),
});

/**
 * POST /api/extension/link - Link an extension to a project
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = linkExtensionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { projectId, deviceId, deviceName, expiresInDays } = validation.data;

    // Get project and verify membership
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<"projects">
    );

    if (!project || !organizationId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const membership = await checkOrganizationMembershipForToken(
      convex,
      auth.accessToken!,
      organizationId
    );

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Link the extension — the acting user is resolved server-side from the
    // bearer token inside the ForToken mutation (requireBearerUser).
    const access = await convex.mutation(
      api.projectAccess.linkExtensionForToken,
      {
        accessToken: auth.accessToken!,
        projectId: projectId as Id<"projects">,
        deviceId,
        deviceName,
        expiresInDays,
      }
    );

    return NextResponse.json({
      data: {
        access: {
          _id: access.accessId,
          accessToken: access.accessToken,
          expiresAt: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
        },
      },
    });
  } catch (error) {
    reportApiError(error, "POST /api/extension/link");
    const message =
      error instanceof Error ? error.message : "Failed to link extension";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
