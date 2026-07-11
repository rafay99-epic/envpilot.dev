import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import { reportApiError } from "@/lib/api-errors";
import {
  getBearerToken,
  getConvexUrl,
  mapPublicApiError,
} from "@/lib/public-api";

type RouteParams = { params: Promise<{ slug: string }> };

const querySchema = z.object({
  environment: z.string().min(1).optional(),
  metadataOnly: z.boolean().optional(),
});

/**
 * GET /api/v1/projects/{slug}/accounts
 *
 * Public REST API v1 — shared project accounts (the `accounts` resource
 * gate). Filters: `environment`, `metadata_only` (skip vault decrypt, no
 * username/password in the response). All auth/scope/gating/rate
 * limiting/audit happens inside
 * convex/features/api/reads.ts:getProjectAccounts, which routes through the
 * single enforcement core (`_authorizeRequest`).
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

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    environment: searchParams.get("environment") ?? undefined,
    metadataOnly: searchParams.has("metadata_only")
      ? searchParams.get("metadata_only") === "true"
      : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", code: "VALIDATION_ERROR" },
      { status: 400, headers }
    );
  }
  const { environment, metadataOnly } = parsed.data;

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
    const accounts = await new ConvexHttpClient(convexUrl).action(
      api.features.api.reads.getProjectAccounts,
      { token, projectSlug: slug, environment, metadataOnly }
    );
    return NextResponse.json({ accounts }, { headers });
  } catch (error) {
    const mapped = mapPublicApiError(error);
    if (mapped.retryAfterSeconds !== undefined) {
      headers["Retry-After"] = String(mapped.retryAfterSeconds);
    }
    if (mapped.sentryFailureTag) {
      Sentry.captureException(error, {
        tags: { source: "public-api", failure: mapped.sentryFailureTag },
        extra: { slug, environment },
      });
    } else if (mapped.status >= 500) {
      reportApiError(error, "GET /api/v1/projects/[slug]/accounts", {
        slug,
        environment,
      });
    }
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status, headers }
    );
  }
}
