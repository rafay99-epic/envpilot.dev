import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import * as Sentry from "@sentry/nextjs";
import { api } from "@convex/_generated/api";
import { reportApiError } from "@/lib/api-errors";
import {
  getBearerToken,
  getConvexUrl,
  mapPublicApiError,
} from "@/lib/public-api";

/**
 * GET /api/v1/projects
 *
 * Public REST API v1 — live projects within the calling API key's scope
 * (name, slug, bounded variableCount). Bearer-authenticated, no browser
 * session. See apps/web/src/app/api/v1/organization/route.ts for the shared
 * shape notes.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = { "x-request-id": requestId };

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      {
        error: "Missing Authorization: Bearer <API key>",
        code: "MISSING_TOKEN",
      },
      { status: 401, headers }
    );
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    Sentry.captureMessage(
      "public-api: NEXT_PUBLIC_CONVEX_URL is not configured — all public API reads failing",
      { level: "error", tags: { source: "public-api", failure: "config" } }
    );
    return NextResponse.json(
      { error: "Service is not configured", code: "CONFIG_ERROR" },
      { status: 503, headers }
    );
  }

  try {
    const projects = await new ConvexHttpClient(convexUrl).action(
      api.features.api.reads.listProjects,
      { token }
    );
    return NextResponse.json({ projects }, { headers });
  } catch (error) {
    const mapped = mapPublicApiError(error);
    if (mapped.retryAfterSeconds !== undefined) {
      headers["Retry-After"] = String(mapped.retryAfterSeconds);
    }
    if (mapped.sentryFailureTag) {
      Sentry.captureException(error, {
        tags: { source: "public-api", failure: mapped.sentryFailureTag },
      });
    } else if (mapped.status >= 500) {
      reportApiError(error, "GET /api/v1/projects");
    }
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status, headers }
    );
  }
}
