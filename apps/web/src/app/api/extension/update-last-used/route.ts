import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const updateLastUsedSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
});

/**
 * POST /api/extension/update-last-used - Update the last used timestamp for a token
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = updateLastUsedSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { accessToken } = validation.data;

    const success = await convex.mutation(api.projectAccess.updateLastUsed, {
      accessToken,
    });

    return NextResponse.json({
      data: { success },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update last used";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
