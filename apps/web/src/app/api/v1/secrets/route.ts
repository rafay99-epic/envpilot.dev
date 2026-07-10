import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
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

    reportApiError(error, "GET /api/v1/secrets");
    return NextResponse.json(
      { error: "Failed to fetch secrets" },
      { status: 500 }
    );
  }
}
