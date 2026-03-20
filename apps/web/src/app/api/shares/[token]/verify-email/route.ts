import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import { z } from "zod";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { sendShareOtpEmail } from "@/lib/share-emails";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const verifyEmailSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/shares/[token]/verify-email
 * Sends a 6-digit OTP to the recipient if their email matches.
 * Always returns { success: true } to prevent email enumeration.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const validation = verifyEmailSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    // Generate a 6-digit OTP
    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, "0");

    // Hash the OTP with SHA-256 before storing
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

    // Call Convex mutation to verify email and store hashed OTP
    const result = await convex.mutation(
      api.sharedSecrets.verifyRecipientEmail,
      {
        token,
        email,
        otpHash,
      }
    );

    // If email matched, send OTP via email
    if (result.emailMatched) {
      try {
        await sendShareOtpEmail({
          recipientEmail: email,
          otp, // Send the plaintext OTP in the email
        });
      } catch (emailErr) {
        Sentry.captureException(emailErr, {
          tags: { source: "share-email", action: "otp" },
          extra: { recipientEmail: email, token },
        });
        // Don't reveal email send failures to prevent enumeration
      }
    }

    // Always return success (anti-enumeration)
    return NextResponse.json({ success: true });
  } catch (error) {
    // Rate limit errors should be surfaced
    const message = error instanceof Error ? error.message : "";
    if (message.includes("rate limit") || message.includes("Rate limit")) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Report unexpected errors to Sentry but return generic success (anti-enumeration)
    Sentry.captureException(error, {
      tags: { source: "share-verify-email" },
    });
    return NextResponse.json({ success: true });
  }
}
