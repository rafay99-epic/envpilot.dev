import { NextResponse } from "next/server";

/**
 * Public endpoint to expose the Convex deployment URL.
 * Used by the VS Code extension to establish WebSocket subscriptions.
 * No auth required — the URL is already public (NEXT_PUBLIC_ prefix).
 */
export async function GET() {
  return NextResponse.json({
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
  });
}
