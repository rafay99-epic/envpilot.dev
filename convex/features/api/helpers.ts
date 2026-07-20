import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";

/**
 * Shared key-auth plumbing for the machine-surface action modules
 * (reads.ts, requests.ts). No registered functions here — pure helpers, so
 * both surfaces stay byte-identical on hashing, rate limiting, and the
 * uniform denial → error mapping instead of drifting apart.
 */

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
  // tier_gate
  throw new ConvexError(
    "The public API is available on the Pro plan — this organization's plan no longer includes it"
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
  bucket: "apiMetadata" | "cicdPull" | "machineRequestCreate",
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
