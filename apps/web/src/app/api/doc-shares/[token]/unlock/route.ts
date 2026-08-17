import { NextResponse } from "next/server";
import { z } from "zod";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { isRateLimitError } from "@/lib/error-messages";
import {
  derivePassphraseHash,
  MAX_PASSPHRASE_LENGTH,
  MIN_PASSPHRASE_LENGTH,
  UNLOCK_COOKIE_MAX_AGE_SECONDS,
  unlockCookieName,
} from "@/lib/doc-share-crypto";

const unlockSchema = z.object({
  passphrase: z.string().min(MIN_PASSPHRASE_LENGTH).max(MAX_PASSPHRASE_LENGTH),
});

/**
 * POST /api/doc-shares/[token]/unlock — try a passphrase.
 *
 * Three steps, and the ordering is the point:
 *
 *  1. Ask Convex for the state of the link. A locked share hands back its
 *     salt (public on its own) and counts no view.
 *  2. Derive the hash here, where Node crypto lives.
 *  3. Hand the hash straight back to Convex and let IT decide. The cookie
 *     this route sets carries that hash, not a verdict, so a stolen or forged
 *     cookie is worth exactly as much as a wrong passphrase: nothing.
 *
 * Wrong passphrase, unknown token, revoked link and expired link all return
 * the same 401. The endpoint never confirms that a token exists — otherwise
 * it is an oracle for probing which of them do.
 */
// noindex on the API too, not just the page: a shared document must never
// become a search result, whichever surface a crawler reaches first.
const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex, nofollow, noarchive" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rejection = NextResponse.json(
    { error: "Incorrect passphrase." },
    { status: 401, headers: NOINDEX_HEADERS }
  );

  try {
    const validation = unlockSchema.safeParse(await request.json());
    if (!validation.success) return rejection;

    // Fetching the salt is not an attempt: no view is counted, no audit row
    // is written, and the rate limiter is untouched.
    const probe = await convex.mutation(
      api.features.docs.shares.verifyPassphrase,
      { token }
    );
    // No salt means no passphrase to check — a link without one, or no link
    // at all. Saying which would confirm the token exists.
    if (!probe.salt) return rejection;

    const passphraseHash = await derivePassphraseHash(
      validation.data.passphrase,
      probe.salt
    );

    const verified = await convex.mutation(
      api.features.docs.shares.verifyPassphrase,
      { token, passphraseHash }
    );
    if (!verified.ok) return rejection;

    const response = NextResponse.json(
      { status: "ok" },
      { headers: NOINDEX_HEADERS }
    );
    response.cookies.set({
      name: unlockCookieName(token),
      value: passphraseHash,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // Scoped to the endpoint that actually reads it. The page fetches
      // through this API path, so scoping to /d/<token> would mean the cookie
      // is never sent and the reader is asked for the passphrase forever.
      path: `/api/doc-shares/${token}`,
      maxAge: UNLOCK_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    if (isRateLimitError(error)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: NOINDEX_HEADERS }
      );
    }
    return rejection;
  }
}
