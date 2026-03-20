import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { createSecret } from "@/lib/vault";
import { handleApiError, sanitizeConvexError } from "@/lib/api-errors";
import { sendShareNotificationEmail } from "@/lib/share-emails";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const createShareSchema = z.object({
  variableId: z.string(),
  variableKey: z.string(),
  organizationId: z.string(),
  projectId: z.string(),
  encryptedPayload: z.string().min(1).max(131072),
  mode: z.enum(["one_time", "time_limited"]),
  ttlMs: z.number().int().min(3_600_000).max(604_800_000),
  hasPassphrase: z.boolean(),
  recipientEmails: z.array(z.string().email()).min(1).max(10),
  clientKeyBase64Url: z.string().min(1).max(256),
});

/**
 * POST /api/shares - Create a new shared secret
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const validation = createShareSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Resolve Convex user
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });
    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate cryptographically secure token
    const token = "shr_" + crypto.randomBytes(32).toString("hex");

    // Store client-encrypted ciphertext in WorkOS Vault
    const vaultResult = await createSecret(
      `share:${data.variableKey}:${Date.now()}`,
      data.encryptedPayload,
      {
        organizationId: data.organizationId,
        projectId: data.projectId,
        environment: "share",
      }
    );

    // Create share in Convex (with feature gating + rate limiting)
    const expiresAt = Date.now() + data.ttlMs;
    const result = await convex.mutation(api.sharedSecrets.createShare, {
      token,
      vaultRef: vaultResult.id,
      variableId: data.variableId as Id<"environmentVariables">,
      variableKey: data.variableKey,
      organizationId: data.organizationId as Id<"organizations">,
      projectId: data.projectId as Id<"projects">,
      userId: convexUser._id,
      mode: data.mode,
      expiresAt,
      hasPassphrase: data.hasPassphrase,
      recipientEmails: data.recipientEmails,
    });

    // Construct the full share URL with client key in fragment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not configured. Cannot generate share URL."
      );
    }
    const shareUrl = `${baseUrl}/s/${token}#${data.clientKeyBase64Url}`;

    // Send notification emails to all recipients (best-effort, don't fail the request)
    const senderName = convexUser.name || convexUser.email;
    for (const email of data.recipientEmails) {
      try {
        await sendShareNotificationEmail({
          recipientEmail: email,
          senderName,
          variableKey: data.variableKey,
          mode: data.mode,
          expiresAt,
          shareUrl,
        });
      } catch (emailErr) {
        Sentry.captureException(emailErr, {
          tags: { source: "share-email", action: "notification" },
          extra: { recipientEmail: email, token },
        });
      }
    }

    return NextResponse.json({
      token,
      shareId: result.shareId,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create share");
  }
}

/**
 * GET /api/shares - List shares for a specific variable
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const variableId = searchParams.get("variableId");

    if (!variableId) {
      return NextResponse.json(
        { error: "variableId is required" },
        { status: 400 }
      );
    }

    // Resolve Convex user to verify they have access
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    });
    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const shares = await convex.query(api.sharedSecrets.listByVariable, {
      variableId: variableId as Id<"environmentVariables">,
    });

    return NextResponse.json(shares);
  } catch (error) {
    return handleApiError(error, "Failed to list shares");
  }
}
