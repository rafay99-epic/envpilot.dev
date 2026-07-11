import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import * as Sentry from "@sentry/nextjs";
import { api } from "@convex/_generated/api";
import { reportApiError } from "@/lib/api-errors";

/**
 * GET /api/v1/secrets?environment=<env>
 *
 * Machine endpoint for CI/CD (the Envpilot GitHub Action). Authenticates
 * with a Bearer SERVICE TOKEN (`envpk_…`) — no browser session, no WorkOS.
 * The token itself carries the project scope, so no project param exists:
 * a token can never be pointed at a different project than it was minted
 * for. All validation (hashing, lookup, revocation, environment scope,
 * tier gate, rate limit, audit) happens in the Convex action.
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
      { error: "Missing Authorization: Bearer <service token>" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const environment = searchParams.get("environment");
  if (!environment) {
    return NextResponse.json(
      { error: "Missing required query param: environment" },
      { status: 400 }
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    // Config failure = every CI pull on this deployment is down. Alert.
    Sentry.captureMessage(
      "cicd-pull: NEXT_PUBLIC_CONVEX_URL is not configured — all secret pulls failing",
      { level: "error", tags: { source: "cicd-pull", failure: "config" } }
    );
    return NextResponse.json(
      { error: "Service is not configured" },
      { status: 503 }
    );
  }

  try {
    const result = await new ConvexHttpClient(convexUrl).action(
      api.features.cicd.pull.pullSecrets,
      { token, environment }
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pull failed";

    // Map the action's error phrases onto proper HTTP statuses without
    // leaking anything beyond what the action already chose to say.
    if (/invalid or revoked/i.test(message)) {
      return NextResponse.json(
        { error: "Invalid or revoked service token" },
        { status: 401 }
      );
    }
    if (/not scoped to/i.test(message)) {
      return NextResponse.json(
        {
          error: `This token is not scoped to the "${environment}" environment`,
        },
        { status: 403 }
      );
    }
    if (/pro plan/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "CI/CD service tokens require the Pro plan — this organization's plan no longer includes them",
        },
        { status: 403 }
      );
    }
    if (/rate ?limit/i.test(message)) {
      return NextResponse.json(
        { error: "Rate limit exceeded — retry shortly" },
        { status: 429 }
      );
    }

    // The two loud-failure classes from the pull action: both mean a
    // customer's CI pipeline is broken RIGHT NOW — distinct tags so alerts
    // are triageable without log digging. (The 4xx branches above are
    // expected client errors and deliberately never reach Sentry.)
    if (/failed to decrypt/i.test(message)) {
      Sentry.captureException(error, {
        tags: { source: "cicd-pull", failure: "vault-decrypt" },
        extra: { environment },
      });
      return NextResponse.json(
        {
          error:
            "A variable could not be decrypted — pull aborted. Retry; if it persists, re-save the variable in Envpilot.",
        },
        { status: 503 }
      );
    }
    if (/refusing a partial pull/i.test(message)) {
      Sentry.captureException(error, {
        tags: { source: "cicd-pull", failure: "variable-overflow" },
        extra: { environment },
      });
      return NextResponse.json({ error: message }, { status: 422 });
    }

    reportApiError(error, "GET /api/v1/secrets", {
      environment,
      failure: "unknown",
    });
    return NextResponse.json(
      { error: "Failed to fetch secrets" },
      { status: 500 }
    );
  }
}
