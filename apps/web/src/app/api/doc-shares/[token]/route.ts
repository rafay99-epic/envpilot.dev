import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { isRateLimitError } from "@/lib/error-messages";
import { unlockCookieName } from "@/lib/doc-share-crypto";

/**
 * GET /api/doc-shares/[token] — read a publicly shared documentation page.
 *
 * Unauthenticated by design: the token is the credential. Every gate lives in
 * the Convex mutation behind this, including the passphrase comparison — this
 * route only forwards the hash it finds in the unlock cookie. There is no
 * "unlocked" boolean it could assert on the reader's behalf.
 *
 * A MUTATION, not a query, because the read counts a view and writes an audit
 * row, and Convex queries cannot write.
 *
 * Unknown, revoked, expired, unpublished and downgraded all produce the same
 * 404 body. Nothing here tells a prober which one it hit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  // Module links carry the page being opened here; the mutation matches it
  // against the module's own resolved pages, so nothing is trusted from it.
  const docSlug = new URL(request.url).searchParams.get("docSlug") ?? undefined;

  // noindex on the API too, not just the page: a shared document must never
  // become a search result, whichever surface a crawler reaches first.
  const headers = { "X-Robots-Tag": "noindex, nofollow, noarchive" };

  try {
    const jar = await cookies();
    const passphraseHash = jar.get(unlockCookieName(token))?.value;

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const result = await convex.mutation(
      api.features.docs.shares.readSharedByToken,
      { token, docSlug, passphraseHash, ipAddress, userAgent }
    );

    if (result.status === "locked") {
      return NextResponse.json(
        { status: "locked", salt: result.salt },
        { status: 401, headers }
      );
    }
    if (result.status !== "ok") {
      return NextResponse.json(
        { error: "This link is invalid, expired, or was revoked." },
        { status: 404, headers }
      );
    }

    // Forwarded whole: the mutation already returns the shaped public view
    // (a module index, or one page), and nothing else.
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (isRateLimitError(error)) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers }
      );
    }
    // Deliberately uniform: an unexpected failure must not be distinguishable
    // from a bad token either.
    return NextResponse.json(
      { error: "This link is invalid, expired, or was revoked." },
      { status: 404, headers }
    );
  }
}
