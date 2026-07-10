import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { z } from "zod";
import crypto from "crypto";
import * as Sentry from "@sentry/nextjs";
import { handleApiError, sanitizeConvexError } from "@/lib/api-errors";
import { sendShareNotificationEmail } from "@/lib/share-emails";

const createShareSchema = z
  .object({
    variableId: z.string().optional(),
    accountId: z.string().optional(),
    resourceType: z.enum(["variable", "account"]).default("variable"),
    variableKey: z.string(),
    organizationId: z.string(),
    projectId: z.string(),
    encryptedPayload: z.string().min(1).max(131072),
    mode: z.enum(["one_time", "time_limited"]),
    ttlMs: z.number().int().min(3_600_000).max(604_800_000),
    hasPassphrase: z.boolean(),
    recipientEmails: z.array(z.string().email()).min(1).max(10),
    clientKeyBase64Url: z.string().min(1).max(256),
  })
  .refine(
    (data) =>
      data.resourceType === "account" ? !!data.accountId : !!data.variableId,
    {
      message:
        'variableId is required when resourceType is "variable"; accountId is required when resourceType is "account"',
      path: ["variableId"],
    }
  );

/**
 * POST /api/shares - Create a new shared secret
 */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();
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
    const convexUser = await convex.query(
      api.features.users.users.getByWorkosId,
      {
        workosId: user.id,
      }
    );
    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate cryptographically secure token
    const token = "shr_" + crypto.randomBytes(32).toString("hex");

    // Store the client-encrypted ciphertext in WorkOS Vault and create the
    // share (feature gating + rate limiting) in one composed Convex action;
    // the ciphertext crypto now lives in Convex, never in the web app.
    const expiresAt = Date.now() + data.ttlMs;
    const result = await createAuthedConvexClient(accessToken!).action(
      api.features.variables.share.createWithPayload,
      {
        token,
        encryptedPayload: data.encryptedPayload,
        variableKey: data.variableKey,
        organizationId: data.organizationId as Id<"organizations">,
        projectId: data.projectId as Id<"projects">,
        resourceType: data.resourceType,
        variableId:
          data.resourceType === "variable"
            ? (data.variableId as Id<"environmentVariables">)
            : undefined,
        accountId:
          data.resourceType === "account"
            ? (data.accountId as Id<"projectAccounts">)
            : undefined,
        mode: data.mode,
        expiresAt,
        hasPassphrase: data.hasPassphrase,
        recipientEmails: data.recipientEmails,
      }
    );

    // Construct the full share URL with client key in fragment
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      throw new Error(
        "NEXT_PUBLIC_APP_URL is not configured. Cannot generate share URL."
      );
    }
    const shareUrl = `${baseUrl}/s/${token}#${data.clientKeyBase64Url}`;

    // Send notification emails to all recipients (best-effort, don't fail the
    // request). Track which recipients we couldn't reach so the client can warn
    // the creator — the share itself is already created and valid regardless.
    const senderName = convexUser.name || convexUser.email;
    const emailsFailed: string[] = [];
    for (const email of data.recipientEmails) {
      try {
        await sendShareNotificationEmail({
          recipientEmail: email,
          senderName,
          variableKey: data.variableKey,
          mode: data.mode,
          expiresAt,
          shareUrl,
          resourceType: data.resourceType,
        });
      } catch (emailErr) {
        emailsFailed.push(email);
        Sentry.captureException(emailErr, {
          tags: { source: "share-email", action: "notification" },
          extra: { recipientEmail: email, token },
        });
      }
    }

    return NextResponse.json({
      token,
      shareId: result.shareId,
      emailsFailed,
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
    const { user, accessToken } = await withAuth();
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
    const convexUser = await convex.query(
      api.features.users.users.getByWorkosId,
      {
        workosId: user.id,
      }
    );
    if (!convexUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const shares = await createAuthedConvexClient(accessToken!).query(
      api.features.sharing.queries.listByVariable,
      {
        variableId: variableId as Id<"environmentVariables">,
      }
    );

    return NextResponse.json(shares);
  } catch (error) {
    return handleApiError(error, "Failed to list shares");
  }
}
