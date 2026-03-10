import { Resend } from "resend";

const RAW_FROM_EMAIL = process.env.FROM_EMAIL || "noreply@invite.envpilot.dev";
const FROM_EMAIL = RAW_FROM_EMAIL.includes("<")
  ? RAW_FROM_EMAIL
  : `Envpilot <${RAW_FROM_EMAIL}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

interface InvitationEmailParams {
  to: string;
  inviterName: string;
  organizationName: string;
  role: "admin" | "team_lead" | "member";
  token: string;
  expiresAt: number;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  organizationName,
  role,
  token,
  expiresAt,
}: InvitationEmailParams): Promise<{ success: boolean; error?: string }> {
  const invitationUrl = `${APP_URL}/invitations/${token}`;
  const expirationDate = new Date(expiresAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const roleDisplay =
    role === "team_lead"
      ? "Team Lead"
      : role.charAt(0).toUpperCase() + role.slice(1);

  // Escape user-provided content to prevent XSS
  const safeInviterName = escapeHtml(inviterName);
  const safeOrgName = escapeHtml(organizationName);
  const safeOrgInitial = escapeHtml(organizationName.charAt(0).toUpperCase());

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to Join ${safeOrgName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="display: inline-block; width: 64px; height: 64px; background-color: #18181b; border-radius: 12px; line-height: 64px; text-align: center;">
                <span style="color: #ffffff; font-size: 28px; font-weight: bold;">${safeOrgInitial}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 20px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                Join ${safeOrgName}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #52525b;">
                <strong>${safeInviterName}</strong> has invited you to join <strong>${safeOrgName}</strong> as a <strong>${roleDisplay}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <a href="${invitationUrl}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                Accept Invitation
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #71717a;">
                This invitation expires on <strong>${expirationDate}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #a1a1aa;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                Button not working? Copy this link:<br>
                <a href="${invitationUrl}" style="color: #71717a; word-break: break-all;">${invitationUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const textContent = `
Join ${organizationName}

${inviterName} has invited you to join ${organizationName} as a ${roleDisplay}.

Accept the invitation by visiting:
${invitationUrl}

This invitation expires on ${expirationDate}.

If you didn't expect this invitation, you can safely ignore this email.
`;

  try {
    const resend = getResendClient();

    if (!resend) {
      console.error(
        "[EMAIL] RESEND_API_KEY not configured - cannot send email"
      );
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    console.log("[EMAIL] Sending invitation email:", {
      from: FROM_EMAIL,
      to,
      subject: `${inviterName} invited you to join ${organizationName}`,
    });

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `${inviterName} invited you to join ${organizationName}`,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error(
        "[EMAIL] Resend API error:",
        JSON.stringify(error, null, 2)
      );
      return { success: false, error: error.message };
    }

    console.log("[EMAIL] Email sent successfully:", JSON.stringify(data));
    return { success: true };
  } catch (err) {
    console.error("[EMAIL] Exception sending email:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

interface SessionRevocationEmailParams {
  to: string;
  organizationName: string;
  revokedByName: string;
  revokedType: "cli" | "extension" | "all";
  revokedCount: number;
}

export async function sendSessionRevocationEmail({
  to,
  organizationName,
  revokedByName,
  revokedType,
  revokedCount,
}: SessionRevocationEmailParams): Promise<{
  success: boolean;
  error?: string;
}> {
  const safeOrgName = escapeHtml(organizationName);
  const safeOrgInitial = escapeHtml(organizationName.charAt(0).toUpperCase());
  const safeRevokedByName = escapeHtml(revokedByName);

  const typeDisplay =
    revokedType === "cli"
      ? "CLI"
      : revokedType === "extension"
        ? "VS Code Extension"
        : "CLI and VS Code Extension";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sessions Revoked - ${safeOrgName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <div style="display: inline-block; width: 64px; height: 64px; background-color: #dc2626; border-radius: 12px; line-height: 64px; text-align: center;">
                <span style="color: #ffffff; font-size: 28px; font-weight: bold;">${safeOrgInitial}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 20px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                Sessions Revoked
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; font-size: 16px; line-height: 1.5; color: #52525b;">
                <strong>${safeRevokedByName}</strong> has revoked your <strong>${typeDisplay}</strong> session${revokedCount > 1 ? "s" : ""} in <strong>${safeOrgName}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #71717a;">
                ${revokedCount} session${revokedCount > 1 ? "s were" : " was"} revoked. You will need to re-authenticate to regain access.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #e4e4e7; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                If you believe this was done in error, contact your organization administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const textContent = `
Sessions Revoked - ${organizationName}

${revokedByName} has revoked your ${typeDisplay} session${revokedCount > 1 ? "s" : ""} in ${organizationName}.

${revokedCount} session${revokedCount > 1 ? "s were" : " was"} revoked. You will need to re-authenticate to regain access.

If you believe this was done in error, contact your organization administrator.
`;

  try {
    const resend = getResendClient();

    if (!resend) {
      console.error(
        "[EMAIL] RESEND_API_KEY not configured - cannot send email"
      );
      return { success: false, error: "RESEND_API_KEY not configured" };
    }

    console.log("[EMAIL] Sending session revocation email:", {
      from: FROM_EMAIL,
      to,
      subject: `Sessions revoked in ${organizationName}`,
    });

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Sessions revoked in ${organizationName}`,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error(
        "[EMAIL] Resend API error:",
        JSON.stringify(error, null, 2)
      );
      return { success: false, error: error.message };
    }

    console.log("[EMAIL] Email sent successfully:", JSON.stringify(data));
    return { success: true };
  } catch (err) {
    console.error("[EMAIL] Exception sending email:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}
