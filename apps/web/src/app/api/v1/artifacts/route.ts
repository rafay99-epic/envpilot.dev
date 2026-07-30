import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { api } from "@convex/_generated/api";
import { createB2DownloadUrl } from "@/lib/b2";
import { reportApiError } from "@/lib/api-errors";
import {
  getBearerToken,
  getConvexUrl,
  mapPublicApiError,
} from "@/lib/public-api";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

/**
 * GET /api/v1/artifacts?names=google-services.json,release.keystore
 *
 * Read-only GitHub Action endpoint. The token itself identifies exactly one
 * project and must carry the artifacts resource. Ciphertext still bypasses
 * Envpilot; this response contains short-lived B2 URLs and per-file data keys.
 */
export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json(
      {
        error: "Missing Authorization: Bearer <API key>",
        code: "MISSING_TOKEN",
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const rawNames = new URL(request.url).searchParams.get("names");
  const names = rawNames
    ? rawNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    : undefined;
  if (names && names.length > 100) {
    return NextResponse.json(
      {
        error: "At most 100 artifact names may be requested",
        code: "VALIDATION_ERROR",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    Sentry.captureMessage(
      "artifact-api: NEXT_PUBLIC_CONVEX_URL is not configured",
      { level: "error", tags: { source: "artifact-api", failure: "config" } }
    );
    return NextResponse.json(
      { error: "Service is not configured", code: "CONFIG_ERROR" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const prepared = await new ConvexHttpClient(convexUrl).action(
      api.features.artifacts.api.prepareGithubActionPull,
      { token, names }
    );
    const artifacts = await Promise.all(
      prepared.artifacts.map(async ({ objectKey, ...artifact }) => ({
        ...artifact,
        downloadUrl: await createB2DownloadUrl(objectKey),
      }))
    );
    return NextResponse.json(
      { project: prepared.project, artifacts },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const mapped = mapPublicApiError(error);
    if (
      /artifact not found/i.test(error instanceof Error ? error.message : "")
    ) {
      return NextResponse.json(
        { error: "Artifact not found", code: "NOT_FOUND" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    if (mapped.retryAfterSeconds !== undefined) {
      return NextResponse.json(
        { error: mapped.message, code: mapped.code },
        {
          status: mapped.status,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(mapped.retryAfterSeconds),
          },
        }
      );
    }
    if (mapped.status >= 500) {
      reportApiError(error, "GET /api/v1/artifacts");
    }
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status, headers: NO_STORE_HEADERS }
    );
  }
}
