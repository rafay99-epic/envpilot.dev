import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import crypto from "crypto";
import { readSecret, deleteSecret } from "@/lib/vault";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
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
  try {
    const { token } = await params;
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

    // OTP verified -- read the client-encrypted ciphertext from Vault
    const encryptedPayload = await readSecret(result.vaultRef);

    // For one-time shares, delete the vault entry
    if (result.mode === "one_time") {
      try {
        await deleteSecret(result.vaultRef);
      } catch {
        // Best effort -- cleanup cron will handle it
      }
    }

    return NextResponse.json({
      encryptedPayload,
      hasPassphrase: result.hasPassphrase,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";

    // Return specific error messages for known cases
    if (message.includes("already viewed")) {
      return NextResponse.json({ error: message }, { status: 410 });
    }
    if (message.includes("expired")) {
      return NextResponse.json({ error: message }, { status: 410 });
    }
    if (message.includes("revoked")) {
      return NextResponse.json({ error: message }, { status: 410 });
    }
    if (message.includes("not found") || message.includes("Not found")) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    if (message.includes("not authorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("locked out")) {
      return NextResponse.json({ error: message }, { status: 403 });
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

    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
