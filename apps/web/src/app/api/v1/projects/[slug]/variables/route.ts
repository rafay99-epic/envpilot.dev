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
import { buildDotenvContent } from "@/lib/dotenv-format";

type RouteParams = { params: Promise<{ slug: string }> };

const querySchema = z.object({
  environment: z.string().min(1).optional(),
  keys: z.string().min(1).optional(),
  prefix: z.string().min(1).optional(),
  metadataOnly: z.boolean().optional(),
  format: z.enum(["json", "env"]).optional(),
});

/**
 * GET /api/v1/projects/{slug}/variables
 *
 * Public REST API v1 — the workhorse endpoint. Filters: `environment`
 * (required unless `metadata_only=true`), `keys` (comma-separated exact
 * keys), `prefix`, `metadata_only` (skip vault decrypt entirely), and
 * `format=env` (dotenv text instead of JSON). All auth/scope/gating/rate
 * limiting/audit happens inside convex/features/api/reads.ts:getProjectVariables,
 * which routes through the single enforcement core (`_authorizeRequest`).
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
  // Same contract as /api/v1/files: a client holding a surface-scoped key
  // names its surface so authorize.ts checks that surface's tier gate. The
  // Docker image presents "docker" (gated on docker_image, NOT public_api).
  // An unrecognised value is dropped rather than trusted.
  const surfaceParam = searchParams.get("surface");
  const surface = surfaceParam === "docker" ? surfaceParam : undefined;
  const parsed = querySchema.safeParse({
    environment: searchParams.get("environment") ?? undefined,
    keys: searchParams.get("keys") ?? undefined,
    prefix: searchParams.get("prefix") ?? undefined,
    metadataOnly: searchParams.has("metadata_only")
      ? searchParams.get("metadata_only") === "true"
      : undefined,
    format: searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", code: "VALIDATION_ERROR" },
      { status: 400, headers }
    );
  }
  const { environment, keys, prefix, metadataOnly, format } = parsed.data;

  if (!metadataOnly && !environment) {
    return NextResponse.json(
      {
        error:
          "Missing required query param: environment (or pass metadata_only=true)",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers }
    );
  }
  if (format === "env" && metadataOnly) {
    return NextResponse.json(
      {
        error:
          "format=env requires actual values — do not combine with metadata_only=true",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers }
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
    const variables = await new ConvexHttpClient(convexUrl).action(
      api.features.api.reads.getProjectVariables,
      {
        token,
        projectSlug: slug,
        environment,
        keys: keys
          ? keys
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
          : undefined,
        prefix,
        metadataOnly,
        ...(surface ? { surface } : {}),
      }
    );

    if (format === "env") {
      const body = buildDotenvContent(
        variables
          .filter(
            (v): v is typeof v & { value: string } => v.value !== undefined
          )
          .map((v) => ({ key: v.key, value: v.value }))
      );
      return new NextResponse(body, {
        headers: { ...headers, "content-type": "text/plain; charset=utf-8" },
      });
    }

    return NextResponse.json({ variables }, { headers });
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
      reportApiError(error, "GET /api/v1/projects/[slug]/variables", {
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
