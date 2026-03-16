import { NextResponse } from "next/server";
import { APP_VERSIONS } from "@/lib/versions";

/**
 * GET /api/version
 * Public endpoint returning current release versions for all surfaces.
 * Used by the web app, CLI, and VS Code extension to detect updates.
 * No auth required.
 */
export async function GET() {
  return NextResponse.json(APP_VERSIONS);
}
