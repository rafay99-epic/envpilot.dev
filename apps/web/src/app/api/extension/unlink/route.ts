import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import { authenticateExtensionRequest } from "@/lib/extension-auth";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const unlinkExtensionSchema = z.object({
  projectId: z.string().min(1, "Project ID is required"),
  deviceId: z.string().min(1, "Device ID is required"),
});

/**
 * POST /api/extension/unlink - Unlink an extension from a project
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateExtensionRequest(request);

    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = unlinkExtensionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { projectId, deviceId } = validation.data;

    const convexUser = auth.convexUser;

    // Unlink the extension
    await convex.mutation(api.projectAccess.unlinkExtension, {
      projectId: projectId as Id<"projects">,
      userId: convexUser._id,
      deviceId,
    });

    return NextResponse.json({
      data: { success: true },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to unlink extension";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
