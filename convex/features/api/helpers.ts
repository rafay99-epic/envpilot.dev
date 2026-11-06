import { ConvexError } from "convex/values";
import type { ActionCtx, QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";

/**
 * Shared key-auth plumbing for the machine-surface action modules
 * (reads.ts, requests.ts). No registered functions here — pure helpers, so
 * both surfaces stay byte-identical on hashing, rate limiting, and the
 * uniform denial → error mapping instead of drifting apart.
 */

/**
 * Per-project ceiling when counting active variables. Mirrors
 * projects/helpers.ts's listWithStatsCore: a bounded, reactive-safe count,
 * not an exact total for pathological projects.
 */
export const VARIABLE_COUNT_CAP = 500;

/**
 * Total ceiling shared across a whole project listing.
 *
 * Counting each project with its own take(500) had no overall bound, so an
 * organization with 34 projects of 500 active variables read 17,000
 * documents in one query and blew Convex's 16,384-document transaction
 * limit, throwing a non-ConvexError.
 */
export const LIST_PROJECTS_ROW_BUDGET = 8000;

/**
 * Summarize projects, spending one shared read budget.
 *
 * `variableCount` is OMITTED, never zero, for any project the budget could
 * not count: reporting zero would be a sentinel, and a caller has to be able
 * to tell "none" from "not counted". A read stopped by the remaining budget
 * rather than by the cap is treated the same way, because a partial number
 * is worse than no number.
 *
 * Shared by the MCP listing (api/oauth.ts) and the REST listing
 * (api/reads.ts) so the budget rules cannot diverge between them.
 */
export async function summarizeProjectsWithinBudget(
  ctx: QueryCtx,
  projects: ReadonlyArray<Pick<Doc<"projects">, "_id" | "name" | "slug">>
): Promise<Array<{ name: string; slug: string; variableCount?: number }>> {
  let budget = LIST_PROJECTS_ROW_BUDGET;
  const summaries: Array<{
    name: string;
    slug: string;
    variableCount?: number;
  }> = [];

  // Sequential on purpose: the budget has to be spent in order, so the
  // projects that do get counted are counted correctly, rather than every
  // project racing to read its own 500.
  for (const project of projects) {
    if (budget <= 0) {
      summaries.push({ name: project.name, slug: project.slug });
      continue;
    }
    const limit = Math.min(VARIABLE_COUNT_CAP, budget);
    const active = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", project._id).eq("deletedAt", undefined)
      )
      .take(limit);
    budget -= active.length;
    const budgetLimited = limit < VARIABLE_COUNT_CAP && active.length === limit;
    summaries.push({
      name: project.name,
      slug: project.slug,
      ...(budgetLimited ? {} : { variableCount: active.length }),
    });
  }

  return summaries;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cheap format guard before any hashing/rate-limiting. */
export function assertKeyFormat(token: string): void {
  if (!token.startsWith("envpk_")) {
    throw new ConvexError("Invalid or revoked API key");
  }
}

export type Denied =
  | "invalid_key"
  | "resource_scope"
  | "environment_scope"
  | "project_scope"
  | "surface_scope"
  | "tier_gate";

export type Authorization =
  | {
      ok: true;
      organizationId: Id<"organizations">;
      scopeProjects: "all" | Id<"projects">[];
      scopeEnvironments: "all" | string[];
      scopeResources: string[];
      keyId: Id<"apiKeys">;
      project?: { _id: Id<"projects">; name: string; slug: string };
    }
  | { ok: false; denied: Denied };

/**
 * Map a denial from `_authorizeRequest` onto the SAME uniform error strings
 * the routes regex-match (PLAN §2's denial mapping). `project_scope` maps to
 * the SAME "Project not found" error as an unknown slug — an out-of-scope
 * project must never be distinguishable from a nonexistent one. Callers may
 * override the resource_scope message to name the missing resource.
 */
export function throwForDenial(
  denied: Denied,
  overrides?: { resourceScope?: string }
): never {
  if (denied === "invalid_key") {
    throw new ConvexError("Invalid or revoked API key");
  }
  if (denied === "resource_scope") {
    throw new ConvexError(
      overrides?.resourceScope ?? "That resource is not in this API key's scope"
    );
  }
  if (denied === "environment_scope") {
    throw new ConvexError("That environment is not in this API key's scope");
  }
  if (denied === "project_scope") {
    throw new ConvexError("Project not found");
  }
  if (denied === "surface_scope") {
    throw new ConvexError("This API key is not enabled for this surface");
  }
  // tier_gate. Kept in step with SURFACE_GATE_MESSAGE: these surfaces are on
  // every plan now, so "available on the Pro plan" became false.
  //
  // THREE places classify a tier denial by matching this text, and changing
  // it means changing all of them: lib/public-api.ts's mapPublicApiError,
  // app/api/v1/secrets/route.ts, and app/api/v1/files/route.ts. Each accepts
  // the older "Pro plan" wording as well, because the web app and the Convex
  // deployment ship separately.
  throw new ConvexError(
    "The public API is not available on this plan — this organization's plan no longer includes it"
  );
}

/**
 * Consume one unit of the given bucket, keyed by the token hash — always
 * BEFORE any authorize/DB work, capping brute-force probing of invalid
 * credentials too. Re-throws a ConvexError carrying the retry-after
 * duration (the payload survives prod redaction) so HTTP routes can
 * regex-match it and set a Retry-After header.
 */
export async function consumeRateLimit(
  ctx: ActionCtx,
  bucket:
    | "apiMetadata"
    | "cicdPull"
    | "dockerPull"
    | "docCreate"
    | "docUpdate"
    | "fileUpload"
    | "mcpWrite",
  tokenHash: string
): Promise<void> {
  try {
    await rateLimiter.limit(ctx, bucket, { key: tokenHash, throws: true });
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new ConvexError(
        `Rate limit exceeded — retry after ${error.data.retryAfter}ms`
      );
    }
    throw error;
  }
}

export function normalizeClientRef(
  raw: string | undefined
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  // A blank ref would silently turn off retry protection the caller asked for.
  if (!trimmed) throw new ConvexError("client_ref must not be empty");
  if (trimmed.length > 200) {
    throw new ConvexError("client_ref must be at most 200 characters");
  }
  return trimmed;
}
