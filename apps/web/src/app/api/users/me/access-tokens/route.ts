import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { z } from "zod";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// ── Shared validation constants ───────────────────────────────────────────────
// Keep in sync with convex/accessTokens.ts constants and the UI preset buttons.

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// Valid preset durations in days — must match the UI buttons.
const VALID_EXPIRY_DAYS = new Set([7, 30, 90]);

const createTokenSchema = z.object({
  name: z
    .string()
    .min(1, "Token name is required")
    .max(100, "Token name must be 100 characters or fewer"),
  organizationId: z.string().min(1, "Organization is required"),
  // At most 50 projects; each must be a non-empty string (Convex ID).
  projectIds: z
    .array(z.string().min(1))
    .max(50, "A token can restrict up to 50 projects"),
  // Only the three known environment names, no duplicates, max 3.
  environments: z
    .array(z.enum(["development", "staging", "production"]))
    .max(3, "A token can restrict up to 3 environments"),
  // Must be a future timestamp within 90 days, rounded to a valid preset.
  expiresAt: z
    .number()
    .int()
    .positive()
    .refine((val) => val > Date.now(), {
      message: "Expiration must be in the future",
    })
    .refine((val) => val <= Date.now() + NINETY_DAYS_MS, {
      message: "Expiration cannot exceed 90 days from now",
    })
    .refine(
      (val) => {
        const days = Math.round((val - Date.now()) / (24 * 60 * 60 * 1000));
        return VALID_EXPIRY_DAYS.has(days);
      },
      { message: "Token lifetime must be 7, 30, or 90 days" }
    ),
});

/**
 * GET /api/users/me/access-tokens
 * List the caller's active CI/CD access tokens (masked).
 */
export async function GET() {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tokens = await convex.query(api.accessTokens.listForUser, {
      userId: user.id,
    });

    // Enrich with org names.
    // Deduplicate org IDs so we issue one Convex query per unique org, not one
    // per token (avoids N+1 when a user has many tokens for the same org).
    const uniqueOrgIds = [...new Set(tokens.map((t) => t.organizationId))];
    const orgResults = await Promise.all(
      uniqueOrgIds.map((orgId) =>
        convex.query(api.organizations.getById, { organizationId: orgId })
      )
    );
    const orgMap = new Map(uniqueOrgIds.map((id, i) => [id, orgResults[i]]));

    const enriched = tokens.map((t) => {
      const org = orgMap.get(t.organizationId);
      return {
        ...t,
        organizationName: org?.name ?? "Unknown",
        organizationSlug: org?.slug ?? "",
      };
    });

    return NextResponse.json({ tokens: enriched });
  } catch (error) {
    console.error("Error listing access tokens:", error);
    return NextResponse.json(
      { error: "Failed to list access tokens" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/users/me/access-tokens
 * Create a new CI/CD access token.
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createTokenSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { name, organizationId, projectIds, environments, expiresAt } =
      parsed.data;

    // Role and feature checking is fully delegated to the Convex mutation.
    // The mutation resolves the WorkOS user ID → Convex user internally.
    const result = await convex.mutation(api.accessTokens.create, {
      userId: user.id,
      name,
      organizationId: organizationId as Id<"organizations">,
      projectIds: projectIds as Id<"projects">[],
      environments,
      expiresAt,
    });

    // The raw token is returned ONCE here and never stored in plaintext again
    return NextResponse.json(
      { success: true, tokenId: result.tokenId, token: result.token },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating access token:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create access token";
    const status =
      message.includes("Pro plan") || message.includes("require")
        ? 402
        : message.includes("not a member") ||
            message.includes("admin") ||
            message.includes("team lead")
          ? 403
          : message.includes("Invalid environment") ||
              message.includes("duplicate") ||
              message.includes("Token name") ||
              message.includes("Expiration") ||
              message.includes("lifetime must be") ||
              message.includes("does not belong") ||
              message.includes("up to")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
