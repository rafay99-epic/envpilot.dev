import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { z } from "zod";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const validateTokenSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
});

/**
 * POST /api/extension/validate-token - Validate an access token
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = validateTokenSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.flatten() },
        { status: 400 },
      );
    }

    const { accessToken } = validation.data;

    const result = await convex.query(api.projectAccess.validateToken, {
      accessToken,
    });

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to validate token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
