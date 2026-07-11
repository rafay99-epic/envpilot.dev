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

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/projects/{slug}
 *
 * Public REST API v1 — a single project's metadata within the calling API
 * key's scope. An unknown slug and a slug outside the key's scope are BOTH
 * mapped to 404 — never 403 — so a key can never confirm the existence of a
 * project it can't see (PLAN §2/§5).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { slug } = await params;
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
    const project = await new ConvexHttpClient(convexUrl).action(
      api.features.api.reads.getProject,
      { token, projectSlug: slug }
    );
    return NextResponse.json(project, { headers });
  } catch (error) {
    const mapped = mapPublicApiError(error);
    if (mapped.retryAfterSeconds !== undefined) {
      headers["Retry-After"] = String(mapped.retryAfterSeconds);
    }
    if (mapped.sentryFailureTag) {
      Sentry.captureException(error, {
        tags: { source: "public-api", failure: mapped.sentryFailureTag },
        extra: { slug },
      });
    } else if (mapped.status >= 500) {
      reportApiError(error, "GET /api/v1/projects/[slug]", { slug });
    }
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status, headers }
    );
  }
}
