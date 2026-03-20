import { Resend } from "resend";

/**
 * Email templates for Secret Sharing.
 *
 * Uses Resend for transactional email delivery.
 * Two types:
 *   1. Notification — sent when a share is created
 *   2. OTP — sent when recipient verifies their email
 */

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  return new Resend(apiKey);
}

function getFromEmail(): string {
  return process.env.FROM_EMAIL || "noreply@envpilot.dev";
}

/**
 * Send a notification email when a secret is shared with a recipient.
 */
export async function sendShareNotificationEmail(params: {
  recipientEmail: string;
  senderName: string;
  variableKey: string;
  mode: "one_time" | "time_limited";
  expiresAt: number;
  shareUrl: string;
}): Promise<void> {
  const resend = getResendClient();
  const from = getFromEmail();

  const expiresIn = getRelativeTimeString(params.expiresAt);
  const modeLabel =
    params.mode === "one_time"
      ? "This is a one-time link — it will be destroyed after viewing."
      : `This link expires ${expiresIn}.`;

  await resend.emails.send({
    from: `Envpilot <${from}>`,
    to: params.recipientEmail,
    subject: "A secret has been shared with you on Envpilot",
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; padding: 40px 24px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 20px; font-weight: 700; color: #22c55e; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">envpilot</span>
    </div>

    <!-- Card -->
    <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px;">
      <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 8px 0;">Secret shared by</p>
      <p style="color: #fafafa; font-size: 16px; font-weight: 600; margin: 0 0 24px 0;">${escapeHtml(params.senderName)}</p>

      <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <span style="color: #22c55e; font-family: 'SF Mono', Monaco, monospace; font-size: 14px;">${escapeHtml(params.variableKey)}</span>
      </div>

      <p style="color: #71717a; font-size: 13px; margin: 0 0 24px 0;">${modeLabel}</p>

      <a href="${params.shareUrl}" style="display: block; text-align: center; background-color: #22c55e; color: #0a0a0a; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        View Secret
      </a>
    </div>

    <!-- Footer -->
    <p style="color: #52525b; font-size: 12px; text-align: center; margin-top: 24px;">
      If you weren't expecting this, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`,
  });
}

/**
 * Send an OTP verification email.
 */
export async function sendShareOtpEmail(params: {
  recipientEmail: string;
  otp: string;
}): Promise<void> {
  const resend = getResendClient();
  const from = getFromEmail();

  await resend.emails.send({
    from: `Envpilot <${from}>`,
    to: params.recipientEmail,
    subject: `Your Envpilot verification code: ${params.otp}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; padding: 40px 24px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 20px; font-weight: 700; color: #22c55e; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;">envpilot</span>
    </div>

    <!-- Card -->
    <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px; text-align: center;">
      <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 16px 0;">Your verification code</p>

      <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <span style="color: #22c55e; font-family: 'SF Mono', Monaco, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px;">${params.otp}</span>
      </div>

      <p style="color: #71717a; font-size: 13px; margin: 0;">This code expires in 5 minutes.</p>
    </div>

    <!-- Footer -->
    <p style="color: #52525b; font-size: 12px; text-align: center; margin-top: 24px;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`,
  });
}

// Helpers

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRelativeTimeString(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  if (diff <= 0) return "soon";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  if (hours > 0) return `in ${hours} hour${hours === 1 ? "" : "s"}`;

  const minutes = Math.floor(diff / (1000 * 60));
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
