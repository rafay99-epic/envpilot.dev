import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import * as Sentry from "@sentry/nextjs";
import { api } from "@convex/_generated/api";
import { reportApiError } from "@/lib/api-errors";
import { sanitizeConvexError } from "@/lib/error-messages";

/**
 * GET /api/v1/files?project=<slug>&environment=<env>[&metadataOnly=1][&path=…]
 *
 * Machine endpoint for CI/CD — the Envpilot GitHub Action pulling the
 * keystores and certificates a build needs. Authenticates with a Bearer API
 * key (`envpk_…`); the key must carry the `files` resource, which is never
 * granted by default.
 *
 * All authorization (hashing, revocation, resource/environment/project
 * scope, surface, tier gate, rate limit, audit) happens inside the Convex
 * action via `_authorizeRequest` — the same core the dashboard, the MCP
 * server and the REST API share. This route only translates HTTP.
 *
 * Listed in proxy.ts unauthenticatedPaths — the middleware must never
 * redirect this route to the WorkOS sign-in page.
 */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json(
      { error: "Missing Authorization: Bearer <api key>" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const projectSlug = searchParams.get("project");
  const environment = searchParams.get("environment");
  if (!projectSlug) {
    return NextResponse.json(
      { error: "Missing required query param: project" },
      { status: 400 }
    );
  }
  if (!environment) {
    return NextResponse.json(
      { error: "Missing required query param: environment" },
      { status: 400 }
    );
  }

  // Opt-in metadata mode: path/size/checksum with nothing decrypted, so a
  // caller can diff against local state without pulling any secret.
  const metadataOnly =
    searchParams.get("metadataOnly") === "1" ||
    searchParams.get("metadataOnly") === "true";
  const paths = searchParams.getAll("path");
  // The Envpilot Action identifies itself so a github_action-scoped key
  // authorizes correctly; other REST clients omit it and fall back to the
  // rest_api inference in authorize.ts.
  const surfaceParam = searchParams.get("surface");
  const surface =
    surfaceParam === "github_action" ? "github_action" : undefined;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    Sentry.captureMessage(
      "v1-files: NEXT_PUBLIC_CONVEX_URL is not configured — all file pulls failing",
      { level: "error", tags: { source: "v1-files", failure: "config" } }
    );
    return NextResponse.json(
      { error: "Service is not configured" },
      { status: 503 }
    );
  }

  try {
    const files = await new ConvexHttpClient(convexUrl).action(
      api.features.api.reads.getProjectFiles,
      {
        token,
        projectSlug,
        environment,
        metadataOnly,
        ...(paths.length > 0 ? { paths } : {}),
        ...(surface ? { surface } : {}),
      }
    );
    return NextResponse.json({
      project: { slug: projectSlug },
      environment,
      files,
    });
  } catch (error) {
    // Prod redacts plain Error messages; ConvexError payloads survive.
    const message =
      error instanceof Error ? sanitizeConvexError(error) : "Pull failed";

    if (/invalid or revoked|invalid_key/i.test(message)) {
      return NextResponse.json(
        { error: "Invalid or revoked API key" },
        { status: 401 }
      );
    }
    if (/not scoped to|scope|not enabled for this surface/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (/pro plan|tier/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (/rate ?limit/i.test(message)) {
      // Surface the limiter's cooldown so a CI client can wait it out rather
      // than retrying straight into another 429. The limiter reports
      // MILLISECONDS and Retry-After is SECONDS — emitting the raw number
      // told CI to wait 16.7 hours for a 60-second cooldown.
      const retryMatch = /retry (?:after |in )?(\d+)ms/i.exec(message);
      const retryAfterMs = retryMatch ? Number(retryMatch[1]) : 60_000;
      const retryAfter = String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
      return NextResponse.json(
        { error: "Rate limit exceeded — retry shortly" },
        { status: 429, headers: { "Retry-After": retryAfter } }
      );
    }
    if (/project not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    // Both loud-failure classes mean a customer's pipeline is broken RIGHT
    // NOW — distinct tags so alerts are triageable without log digging.
    if (/failed to decrypt/i.test(message)) {
      Sentry.captureException(error, {
        tags: { source: "v1-files", failure: "vault-decrypt" },
        extra: { projectSlug, environment },
      });
      return NextResponse.json(
        {
          error:
            "A secret file could not be decrypted — pull aborted. Retry; if it persists, re-upload the file in Envpilot.",
        },
        { status: 503 }
      );
    }
    if (/refusing a partial pull/i.test(message)) {
      Sentry.captureException(error, {
        tags: { source: "v1-files", failure: "file-overflow" },
        extra: { projectSlug, environment },
      });
      return NextResponse.json({ error: message }, { status: 422 });
    }

    reportApiError(error, "GET /api/v1/files", {
      projectSlug,
      environment,
      failure: "unknown",
    });
    return NextResponse.json(
      { error: "Failed to fetch secret files" },
      { status: 500 }
    );
  }
}
