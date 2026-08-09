import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { z } from "zod";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError } from "@/lib/api-errors";
import {
  derivePassphraseHash,
  MAX_PASSPHRASE_LENGTH,
  MIN_PASSPHRASE_LENGTH,
  newPassphraseSalt,
  newShareToken,
} from "@/lib/doc-share-crypto";

const HOUR_MS = 3_600_000;
const THIRTY_DAYS_MS = 30 * 24 * HOUR_MS;

// Exactly one target. The Convex mutation enforces this too — this is the
// early, friendlier refusal, not the authoritative one.
const createLinkSchema = z
  .object({
    docId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    module: z.string().min(1).max(100).optional(),
    ttlMs: z.number().int().min(HOUR_MS).max(THIRTY_DAYS_MS),
    passphrase: z
      .string()
      .min(MIN_PASSPHRASE_LENGTH)
      .max(MAX_PASSPHRASE_LENGTH)
      .optional(),
    recipientEmail: z.string().email().optional(),
    note: z.string().max(280).optional(),
  })
  .refine(
    (data) =>
      data.module !== undefined
        ? data.projectId !== undefined && data.docId === undefined
        : data.docId !== undefined,
    {
      message:
        "Provide either docId, or projectId together with module — not both.",
      path: ["docId"],
    }
  );

/**
 * POST /api/doc-shares — mint a public preview link for a published page.
 *
 * The token and the scrypt derivation happen here (Node crypto); every gate —
 * capability, tier, active-link cap, published-only, rate limit — lives in
 * the Convex mutation, so this route cannot be the thing that authorizes.
 */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const validation = createLinkSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }
    const data = validation.data;

    const token = newShareToken();
    let passphraseSalt: string | undefined;
    let passphraseHash: string | undefined;
    if (data.passphrase) {
      passphraseSalt = newPassphraseSalt();
      passphraseHash = await derivePassphraseHash(
        data.passphrase,
        passphraseSalt
      );
    }

    const authed = createAuthedConvexClient(accessToken);
    const result = await authed.mutation(
      api.features.docs.shares.createPublicLink,
      {
        docId: data.docId as Id<"docs"> | undefined,
        projectId: data.projectId as Id<"projects"> | undefined,
        module: data.module,
        token,
        passphraseHash,
        passphraseSalt,
        recipientEmail: data.recipientEmail,
        ttlMs: data.ttlMs,
        note: data.note,
      }
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not configured. Cannot generate share URL."
      );
    }
    const url = `${baseUrl}/d/${token}`;

    // The recipient email is scheduled inside the mutation — best-effort by
    // construction, and it keeps URL shaping in the one module that already
    // builds every other outbound link.
    return NextResponse.json({
      token,
      url,
      shareId: result.shareId,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create documentation link");
  }
}
