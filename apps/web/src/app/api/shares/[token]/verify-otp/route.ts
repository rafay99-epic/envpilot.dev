import { NextResponse } from "next/server";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { readSecret, deleteSecret } from "@/lib/vault";

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/),
});

/**
 * POST /api/shares/[token]/verify-otp
 * Verifies the OTP and returns the client-encrypted ciphertext from Vault.
 * For one-time shares, the vault entry is deleted after reading.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const body = await request.json();
    const validation = verifyOtpSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid OTP format" },
        { status: 400 }
      );
    }

    const { email, otp } = validation.data;

    // Hash the user-provided OTP for comparison
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    // Extract viewer info from headers
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    // Verify OTP via Convex (atomically validates + burns for one-time)
    const result = await convex.mutation(api.sharedSecrets.verifyOtp, {
      token,
      email,
      otpHash,
      ipAddress,
      userAgent,
    });

    // OTP verified — read the client-encrypted ciphertext from Vault
    let encryptedPayload: string;
    try {
      encryptedPayload = await readSecret(result.vaultRef);
    } catch (vaultErr) {
      Sentry.captureException(vaultErr, {
        tags: { source: "share-vault", action: "read" },
        extra: { token, vaultRef: result.vaultRef },
      });
      return NextResponse.json(
        { error: "Failed to retrieve the secret. Please try again." },
        { status: 502 }
      );
    }

    // For one-time shares, delete the vault entry (best-effort)
    if (result.mode === "one_time") {
      try {
        await deleteSecret(result.vaultRef);
      } catch (deleteErr) {
        Sentry.captureException(deleteErr, {
          tags: { source: "share-vault", action: "delete" },
          extra: { token, vaultRef: result.vaultRef },
        });
      }
    }

    return NextResponse.json({
      encryptedPayload,
      hasPassphrase: result.hasPassphrase,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";

    // Classify Convex errors into proper HTTP status codes
    if (message.includes("already viewed") || message.includes("destroyed")) {
      return NextResponse.json(
        { error: "This secret was already viewed and destroyed." },
        { status: 410 }
      );
    }
    if (message.includes("expired")) {
      return NextResponse.json(
        { error: "This secret has expired." },
        { status: 410 }
      );
    }
    if (message.includes("revoked")) {
      return NextResponse.json(
        { error: "This share link was revoked by the owner." },
        { status: 410 }
      );
    }
    if (message.includes("not found") || message.includes("Not found")) {
      return NextResponse.json(
        { error: "This share link is invalid or has expired." },
        { status: 404 }
      );
    }
    if (message.includes("not authorized")) {
      // Use same generic message as not-found to prevent share existence enumeration
      return NextResponse.json(
        { error: "This share link is invalid or has expired." },
        { status: 404 }
      );
    }
    if (message.includes("locked out")) {
      return NextResponse.json(
        { error: "Too many failed attempts. This email has been locked out." },
        { status: 403 }
      );
    }
    if (
      message.includes("attempts remaining") ||
      message.includes("Invalid verification")
    ) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.includes("rate limit") || message.includes("Rate limit")) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Unexpected errors → Sentry + generic message
    Sentry.captureException(error, {
      tags: { source: "share-verify-otp" },
      extra: { token },
    });

    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
