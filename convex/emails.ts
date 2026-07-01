"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import { roleLevel, ROLE_LEVEL } from "./authz";

// ============================================================
// Helpers
// ============================================================

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const rawFrom = process.env.FROM_EMAIL || "noreply@invite.envpilot.dev";
  const from = rawFrom.includes("<") ? rawFrom : `Envpilot <${rawFrom}>`;
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  return { resend: new Resend(apiKey), from, appUrl };
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

function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          ${body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function iconRow(initial: string, bgColor = "#18181b"): string {
  return `<tr>
  <td style="padding: 40px 40px 20px 40px; text-align: center;">
    <div style="display: inline-block; width: 64px; height: 64px; background-color: ${bgColor}; border-radius: 12px; line-height: 64px; text-align: center;">
      <span style="color: #ffffff; font-size: 28px; font-weight: bold;">${escapeHtml(initial)}</span>
    </div>
  </td>
</tr>`;
}

function headingRow(text: string): string {
  return `<tr>
  <td style="padding: 0 40px 20px 40px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">${text}</h1>
  </td>
</tr>`;
}

function paragraphRow(
  text: string,
  style = "font-size: 16px; line-height: 1.5; color: #52525b;"
): string {
  return `<tr>
  <td style="padding: 0 40px 30px 40px; text-align: center;">
    <p style="margin: 0; ${style}">${text}</p>
  </td>
</tr>`;
}

function buttonRow(href: string, label: string): string {
  return `<tr>
  <td style="padding: 0 40px 30px 40px; text-align: center;">
    <a href="${href}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">${label}</a>
  </td>
</tr>`;
}

function footerRow(text: string): string {
  return `<tr>
  <td style="padding: 20px 40px; border-top: 1px solid #e4e4e7; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #a1a1aa;">${text}</p>
  </td>
</tr>`;
}

type SendResult = { success: boolean; error?: string; skipped?: boolean };

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<SendResult> {
  const config = getEmailConfig();
  if (!config) {
    console.error("[EMAIL] RESEND_API_KEY not configured");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { data, error } = await config.resend.emails.send({
      from: config.from,
      to: [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error(
        "[EMAIL] Resend API error:",
        JSON.stringify(error, null, 2)
      );
      return { success: false, error: error.message };
    }

    console.log("[EMAIL] Sent:", subject, "to:", to, "id:", data?.id);
    return { success: true };
  } catch (err) {
    console.error("[EMAIL] Exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

// ============================================================
// Email Actions
// ============================================================

export const sendInvitationEmail = action({
  args: {
    to: v.string(),
    inviterName: v.string(),
    organizationName: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("project_manager"),
      v.literal("team_lead"),
      v.literal("developer"),
      // Legacy values (pre unified-roles migration)
      v.literal("admin"),
      v.literal("member")
    ),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (_ctx, args) => {
    const config = getEmailConfig();
    const appUrl = config?.appUrl || "http://localhost:3000";
    const invitationUrl = `${appUrl}/invitations/${args.token}`;
    const expirationDate = new Date(args.expiresAt).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      }
    );
    const ROLE_DISPLAY: Record<string, string> = {
      owner: "Owner",
      project_manager: "Project Manager",
      team_lead: "Team Lead",
      developer: "Developer",
      admin: "Owner",
      member: "Developer",
    };
    const roleDisplay = ROLE_DISPLAY[args.role] ?? "Developer";

    const safeInviter = escapeHtml(args.inviterName);
    const safeOrg = escapeHtml(args.organizationName);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    const html = emailWrapper(
      `Invitation to Join ${safeOrg}`,
      [
        iconRow(orgInitial),
        headingRow(`Join ${safeOrg}`),
        paragraphRow(
          `<strong>${safeInviter}</strong> has invited you to join <strong>${safeOrg}</strong> as a <strong>${roleDisplay}</strong>.`
        ),
        buttonRow(invitationUrl, "Accept Invitation"),
        paragraphRow(
          `This invitation expires on <strong>${expirationDate}</strong>.`,
          "font-size: 14px; color: #71717a;"
        ),
        footerRow(
          `If you didn't expect this invitation, you can safely ignore this email.<br><br>Button not working? Copy this link:<br><a href="${invitationUrl}" style="color: #71717a; word-break: break-all;">${invitationUrl}</a>`
        ),
      ].join("")
    );

    const text = `Join ${args.organizationName}\n\n${args.inviterName} has invited you to join ${args.organizationName} as a ${roleDisplay}.\n\nAccept the invitation by visiting:\n${invitationUrl}\n\nThis invitation expires on ${expirationDate}.\n\nIf you didn't expect this invitation, you can safely ignore this email.`;

    return sendEmail(
      args.to,
      `${args.inviterName} invited you to join ${args.organizationName}`,
      html,
      text
    );
  },
});

export const sendSessionRevocationEmail = action({
  args: {
    to: v.string(),
    organizationName: v.string(),
    revokedByName: v.string(),
    revokedType: v.union(
      v.literal("cli"),
      v.literal("extension"),
      v.literal("all")
    ),
    revokedCount: v.number(),
  },
  handler: async (_ctx, args) => {
    const safeOrg = escapeHtml(args.organizationName);
    const safeRevokedBy = escapeHtml(args.revokedByName);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    const typeDisplay =
      args.revokedType === "cli"
        ? "CLI"
        : args.revokedType === "extension"
          ? "VS Code Extension"
          : "CLI and VS Code Extension";

    const plural = args.revokedCount > 1;

    const html = emailWrapper(
      `Sessions Revoked - ${safeOrg}`,
      [
        iconRow(orgInitial, "#dc2626"),
        headingRow("Sessions Revoked"),
        paragraphRow(
          `<strong>${safeRevokedBy}</strong> has revoked your <strong>${typeDisplay}</strong> session${plural ? "s" : ""} in <strong>${safeOrg}</strong>.`
        ),
        paragraphRow(
          `${args.revokedCount} session${plural ? "s were" : " was"} revoked. You will need to re-authenticate to regain access.`,
          "font-size: 14px; line-height: 1.5; color: #71717a;"
        ),
        footerRow(
          "If you believe this was done in error, contact your organization administrator."
        ),
      ].join("")
    );

    const text = `Sessions Revoked - ${args.organizationName}\n\n${args.revokedByName} has revoked your ${typeDisplay} session${plural ? "s" : ""} in ${args.organizationName}.\n\n${args.revokedCount} session${plural ? "s were" : " was"} revoked. You will need to re-authenticate to regain access.\n\nIf you believe this was done in error, contact your organization administrator.`;

    return sendEmail(
      args.to,
      `Sessions revoked in ${args.organizationName}`,
      html,
      text
    );
  },
});

export const sendOrgTransferEmail = action({
  args: {
    to: v.string(),
    organizationName: v.string(),
    previousOwnerName: v.string(),
    orgSlug: v.string(),
  },
  handler: async (_ctx, args) => {
    const config = getEmailConfig();
    const appUrl = config?.appUrl || "http://localhost:3000";
    const orgUrl = `${appUrl}/organizations/${args.orgSlug}`;

    const safeOrg = escapeHtml(args.organizationName);
    const safePrevOwner = escapeHtml(args.previousOwnerName);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    const html = emailWrapper(
      `Organization Transferred - ${safeOrg}`,
      [
        iconRow(orgInitial),
        headingRow("You Are Now the Owner"),
        paragraphRow(
          `<strong>${safePrevOwner}</strong> has transferred ownership of <strong>${safeOrg}</strong> to you. You are now the admin.<br><br><span style="font-size: 14px; color: #71717a;">All existing members, projects, and settings remain intact.</span>`
        ),
        buttonRow(orgUrl, "Go to Organization"),
        footerRow(
          "If you didn't expect this transfer, please contact support."
        ),
      ].join("")
    );

    const text = `You Are Now the Owner of ${args.organizationName}\n\n${args.previousOwnerName} has transferred ownership of ${args.organizationName} to you. You are now the admin.\n\nAll existing members, projects, and settings remain intact.\n\nGo to your organization: ${orgUrl}\n\nIf you didn't expect this transfer, please contact support.`;

    return sendEmail(
      args.to,
      `You are now the owner of ${args.organizationName}`,
      html,
      text
    );
  },
});

export const sendOrgTransferConfirmationEmail = action({
  args: {
    to: v.string(),
    organizationName: v.string(),
    newOwnerEmail: v.string(),
    orgSlug: v.string(),
  },
  handler: async (_ctx, args) => {
    const safeOrg = escapeHtml(args.organizationName);
    const safeNewOwner = escapeHtml(args.newOwnerEmail);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    const html = emailWrapper(
      `Ownership Transferred - ${safeOrg}`,
      [
        iconRow(orgInitial),
        headingRow("Ownership Transferred"),
        paragraphRow(
          `You have successfully transferred ownership of <strong>${safeOrg}</strong> to <strong>${safeNewOwner}</strong>.<br><br><span style="font-size: 14px; color: #71717a;">All other members, projects, and settings remain intact. You have been removed from the organization.</span>`
        ),
        footerRow(
          "If you didn't initiate this transfer, please contact support immediately."
        ),
      ].join("")
    );

    const text = `Ownership Transferred - ${args.organizationName}\n\nYou have successfully transferred ownership of ${args.organizationName} to ${args.newOwnerEmail}.\n\nAll other members, projects, and settings remain intact. You have been removed from the organization.\n\nIf you didn't initiate this transfer, please contact support immediately.`;

    return sendEmail(
      args.to,
      `Ownership of ${args.organizationName} has been transferred`,
      html,
      text
    );
  },
});

export const sendProjectTransferEmail = action({
  args: {
    to: v.string(),
    projectName: v.string(),
    organizationName: v.string(),
    transferredByName: v.string(),
  },
  handler: async (_ctx, args) => {
    const safeProject = escapeHtml(args.projectName);
    const safeOrg = escapeHtml(args.organizationName);
    const safeTransferredBy = escapeHtml(args.transferredByName);
    const initial = args.projectName.charAt(0).toUpperCase();

    const html = emailWrapper(
      `Project Transferred - ${safeProject}`,
      [
        iconRow(initial),
        headingRow("Project Transferred"),
        paragraphRow(
          `<strong>${safeTransferredBy}</strong> has transferred the project <strong>${safeProject}</strong> to your organization <strong>${safeOrg}</strong>.`
        ),
        footerRow(
          "The project and all its environment variables are now available in your organization."
        ),
      ].join("")
    );

    const text = `Project Transferred - ${args.projectName}\n\n${args.transferredByName} has transferred the project ${args.projectName} to your organization ${args.organizationName}.\n\nThe project and all its environment variables are now available in your organization.`;

    return sendEmail(
      args.to,
      `Project ${args.projectName} transferred to ${args.organizationName}`,
      html,
      text
    );
  },
});

// ============================================================
// Notification Emails (with preference checking)
// ============================================================

export const sendVariableChangeEmail = action({
  args: {
    userId: v.id("users"),
    to: v.string(),
    variableName: v.string(),
    projectName: v.string(),
    changedByName: v.string(),
    changeType: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted")
    ),
  },
  handler: async (ctx, args) => {
    const prefs = await ctx.runQuery(
      internal.userPreferences.getByUserIdInternal,
      {
        userId: args.userId,
      }
    );
    if (prefs?.emailNotifications?.variableChanges === false) {
      return { success: true, skipped: true };
    }

    const safeVar = escapeHtml(args.variableName);
    const safeProject = escapeHtml(args.projectName);
    const safeChangedBy = escapeHtml(args.changedByName);
    const initial = args.projectName.charAt(0).toUpperCase();

    const actionWord =
      args.changeType === "created"
        ? "added a new variable to"
        : args.changeType === "updated"
          ? "updated a variable in"
          : "deleted a variable from";

    const html = emailWrapper(
      `Variable ${args.changeType} - ${safeProject}`,
      [
        iconRow(initial),
        headingRow(
          `Variable ${args.changeType.charAt(0).toUpperCase() + args.changeType.slice(1)}`
        ),
        paragraphRow(
          `<strong>${safeChangedBy}</strong> ${actionWord} <strong>${safeProject}</strong>.<br><br><span style="font-size: 14px; color: #71717a;">Variable: <code style="background: #f4f4f5; padding: 2px 6px; border-radius: 4px;">${safeVar}</code></span>`
        ),
        footerRow(
          'You received this because you have variable change notifications enabled. <a href="#" style="color: #71717a;">Manage preferences</a>'
        ),
      ].join("")
    );

    const text = `Variable ${args.changeType} - ${args.projectName}\n\n${args.changedByName} ${actionWord} ${args.projectName}.\n\nVariable: ${args.variableName}`;

    return sendEmail(
      args.to,
      `Variable ${args.variableName} ${args.changeType} in ${args.projectName}`,
      html,
      text
    );
  },
});

export const sendMemberUpdateEmail = action({
  args: {
    userId: v.id("users"),
    to: v.string(),
    organizationName: v.string(),
    memberName: v.string(),
    updateType: v.union(
      v.literal("added"),
      v.literal("removed"),
      v.literal("role_changed")
    ),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prefs = await ctx.runQuery(
      internal.userPreferences.getByUserIdInternal,
      {
        userId: args.userId,
      }
    );
    if (prefs?.emailNotifications?.memberUpdates === false) {
      return { success: true, skipped: true };
    }

    const safeOrg = escapeHtml(args.organizationName);
    const safeMember = escapeHtml(args.memberName);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    let description: string;
    let subject: string;
    if (args.updateType === "added") {
      description = `<strong>${safeMember}</strong> has joined <strong>${safeOrg}</strong>${args.role ? ` as a <strong>${escapeHtml(args.role)}</strong>` : ""}.`;
      subject = `${args.memberName} joined ${args.organizationName}`;
    } else if (args.updateType === "removed") {
      description = `<strong>${safeMember}</strong> has been removed from <strong>${safeOrg}</strong>.`;
      subject = `${args.memberName} removed from ${args.organizationName}`;
    } else {
      description = `<strong>${safeMember}</strong>'s role in <strong>${safeOrg}</strong> has been changed${args.role ? ` to <strong>${escapeHtml(args.role)}</strong>` : ""}.`;
      subject = `Role changed for ${args.memberName} in ${args.organizationName}`;
    }

    const html = emailWrapper(
      `Team Update - ${safeOrg}`,
      [
        iconRow(orgInitial),
        headingRow("Team Update"),
        paragraphRow(description),
        footerRow(
          'You received this because you have team update notifications enabled. <a href="#" style="color: #71717a;">Manage preferences</a>'
        ),
      ].join("")
    );

    const text = `Team Update - ${args.organizationName}\n\n${description.replace(/<[^>]*>/g, "")}`;

    return sendEmail(args.to, subject, html, text);
  },
});

export const sendAccessRequestEmail = action({
  args: {
    userId: v.id("users"),
    to: v.string(),
    requesterName: v.string(),
    variableName: v.string(),
    projectName: v.string(),
    organizationName: v.string(),
  },
  handler: async (ctx, args) => {
    const prefs = await ctx.runQuery(
      internal.userPreferences.getByUserIdInternal,
      {
        userId: args.userId,
      }
    );
    if (prefs?.emailNotifications?.accessRequests === false) {
      return { success: true, skipped: true };
    }

    const safeRequester = escapeHtml(args.requesterName);
    const safeVar = escapeHtml(args.variableName);
    const safeProject = escapeHtml(args.projectName);
    const safeOrg = escapeHtml(args.organizationName);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    const html = emailWrapper(
      `Access Request - ${safeOrg}`,
      [
        iconRow(orgInitial, "#f59e0b"),
        headingRow("Access Request"),
        paragraphRow(
          `<strong>${safeRequester}</strong> is requesting access to the variable <code style="background: #f4f4f5; padding: 2px 6px; border-radius: 4px;">${safeVar}</code> in project <strong>${safeProject}</strong>.`
        ),
        footerRow(
          'You received this because you have access request notifications enabled. <a href="#" style="color: #71717a;">Manage preferences</a>'
        ),
      ].join("")
    );

    const text = `Access Request - ${args.organizationName}\n\n${args.requesterName} is requesting access to the variable ${args.variableName} in project ${args.projectName}.`;

    return sendEmail(
      args.to,
      `Access request for ${args.variableName} in ${args.projectName}`,
      html,
      text
    );
  },
});

// ============================================================
// Rotation Reminder Emails
// ============================================================

export const sendRotationReminderEmail = internalAction({
  args: {
    variableName: v.string(),
    projectName: v.string(),
    organizationId: v.id("organizations"),
    expiresAt: v.number(),
    reminderType: v.union(
      v.literal("7_days"),
      v.literal("1_day"),
      v.literal("expired")
    ),
  },
  handler: async (ctx, args) => {
    // Get all org members to notify
    const members = await ctx.runQuery(
      internal.organizations.getMembersInternal,
      { organizationId: args.organizationId }
    );

    if (!members || members.length === 0) return;

    const safeVar = escapeHtml(args.variableName);
    const safeProject = escapeHtml(args.projectName);

    const expirationDate = new Date(args.expiresAt).toLocaleDateString(
      "en-US",
      { year: "numeric", month: "long", day: "numeric" }
    );

    const isExpired = args.reminderType === "expired";
    const daysText =
      args.reminderType === "7_days"
        ? "7 days"
        : args.reminderType === "1_day"
          ? "1 day"
          : "";

    const heading = isExpired ? "Secret Expired" : "Secret Expiring Soon";

    const description = isExpired
      ? `The secret <code style="background: #f4f4f5; padding: 2px 6px; border-radius: 4px;">${safeVar}</code> in project <strong>${safeProject}</strong> has expired and should be rotated immediately.`
      : `The secret <code style="background: #f4f4f5; padding: 2px 6px; border-radius: 4px;">${safeVar}</code> in project <strong>${safeProject}</strong> will expire in <strong>${daysText}</strong> (${expirationDate}).`;

    const subject = isExpired
      ? `Secret ${args.variableName} has expired in ${args.projectName}`
      : `Secret ${args.variableName} expires in ${daysText} - ${args.projectName}`;

    const bgColor = isExpired ? "#dc2626" : "#f59e0b";

    const html = emailWrapper(
      heading,
      [
        iconRow(args.projectName.charAt(0).toUpperCase(), bgColor),
        headingRow(heading),
        paragraphRow(description),
        paragraphRow(
          "Please rotate this secret to maintain security.",
          "font-size: 14px; line-height: 1.5; color: #71717a;"
        ),
        footerRow(
          'You received this because rotation reminders are enabled. <a href="#" style="color: #71717a;">Manage preferences</a>'
        ),
      ].join("")
    );

    const text = `${heading}\n\n${isExpired ? `The secret ${args.variableName} in ${args.projectName} has expired.` : `The secret ${args.variableName} in ${args.projectName} will expire in ${daysText} (${expirationDate}).`}\n\nPlease rotate this secret to maintain security.`;

    for (const member of members) {
      if (!member?.user?.email) continue;
      // Only notify members with at least the team_lead role
      // (owner / project_manager / team_lead) — they can act on rotation
      if (roleLevel(member.role) < ROLE_LEVEL.team_lead) continue;

      // Check rotation reminder preference (defaults to true via DEFAULT_NOTIFICATIONS)
      const prefs = await ctx.runQuery(
        internal.userPreferences.getByUserIdInternal,
        { userId: member.user._id }
      );
      if (prefs?.emailNotifications?.rotationReminders === false) continue;

      await sendEmail(member.user.email, subject, html, text).catch((err) =>
        console.warn("[EMAIL] Rotation reminder failed:", err)
      );
    }
  },
});

// ============================================================
// Anomaly Detection Alert Emails
// ============================================================

export const sendAnomalyAlertEmail = internalAction({
  args: {
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    userName: v.string(),
    userEmail: v.string(),
    orgName: v.string(),
    ruleName: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical")
    ),
    details: v.string(),
    detectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const safeUser = escapeHtml(args.userName);
    const safeOrg = escapeHtml(args.orgName);
    const safeRule = escapeHtml(args.ruleName);

    let parsedDetails: Record<string, string> = {};
    try {
      parsedDetails = JSON.parse(args.details);
    } catch {
      // Use empty object
    }

    const detectedDate = new Date(args.detectedAt).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const severityColors: Record<string, string> = {
      critical: "#dc2626",
      warning: "#f59e0b",
      info: "#3b82f6",
    };
    const bgColor = severityColors[args.severity] || "#18181b";

    const severityLabel =
      args.severity.charAt(0).toUpperCase() + args.severity.slice(1);

    // Build details table rows
    const detailRows = [
      `<tr><td style="padding: 8px 12px; font-weight: 600; color: #52525b; border-bottom: 1px solid #f4f4f5;">What</td><td style="padding: 8px 12px; color: #18181b; border-bottom: 1px solid #f4f4f5;">${safeRule}</td></tr>`,
      `<tr><td style="padding: 8px 12px; font-weight: 600; color: #52525b; border-bottom: 1px solid #f4f4f5;">Severity</td><td style="padding: 8px 12px; color: ${bgColor}; font-weight: 600; border-bottom: 1px solid #f4f4f5;">${severityLabel}</td></tr>`,
      `<tr><td style="padding: 8px 12px; font-weight: 600; color: #52525b; border-bottom: 1px solid #f4f4f5;">User</td><td style="padding: 8px 12px; color: #18181b; border-bottom: 1px solid #f4f4f5;">${safeUser}</td></tr>`,
      `<tr><td style="padding: 8px 12px; font-weight: 600; color: #52525b; border-bottom: 1px solid #f4f4f5;">Organization</td><td style="padding: 8px 12px; color: #18181b; border-bottom: 1px solid #f4f4f5;">${safeOrg}</td></tr>`,
      `<tr><td style="padding: 8px 12px; font-weight: 600; color: #52525b; border-bottom: 1px solid #f4f4f5;">When</td><td style="padding: 8px 12px; color: #18181b; border-bottom: 1px solid #f4f4f5;">${detectedDate}</td></tr>`,
    ];

    if (parsedDetails.newIp) {
      detailRows.push(
        `<tr><td style="padding: 8px 12px; font-weight: 600; color: #52525b; border-bottom: 1px solid #f4f4f5;">IP Address</td><td style="padding: 8px 12px; color: #18181b; border-bottom: 1px solid #f4f4f5;">${escapeHtml(String(parsedDetails.newIp))} (new)</td></tr>`
      );
    }

    const detailsTable = `<table role="presentation" style="width: 100%; border-collapse: collapse; background: #fafafa; border-radius: 8px; overflow: hidden; margin: 0 auto;">${detailRows.join("")}</table>`;

    const message =
      parsedDetails.message ||
      `An unusual access pattern was detected: ${args.ruleName}`;

    const config = getEmailConfig();
    const appUrl = config?.appUrl || "http://localhost:3000";

    const subject = `Security Alert — ${args.ruleName}`;

    const html = emailWrapper(
      "Security Alert",
      [
        iconRow("!", bgColor),
        headingRow("Unusual Access Pattern Detected"),
        paragraphRow(escapeHtml(String(message))),
        `<tr><td style="padding: 0 40px 30px 40px;">${detailsTable}</td></tr>`,
        buttonRow(`${appUrl}/dashboard/anomalies`, "Review Activity"),
        paragraphRow(
          "If this wasn't you, we recommend revoking your CLI/extension tokens immediately.",
          "font-size: 14px; line-height: 1.5; color: #dc2626; font-weight: 500;"
        ),
        footerRow(
          'You received this because security alerts are enabled. <a href="' +
            appUrl +
            '/dashboard/settings" style="color: #71717a;">Manage preferences</a>'
        ),
      ].join("")
    );

    const text = `Security Alert — ${args.ruleName}\n\n${message}\n\nUser: ${args.userName}\nOrganization: ${args.orgName}\nWhen: ${detectedDate}\n\nReview activity: ${appUrl}/dashboard/anomalies\n\nIf this wasn't you, revoke your CLI/extension tokens immediately.`;

    // Send to the affected user (if security alerts preference is ON)
    if (args.userEmail) {
      const prefs = await ctx.runQuery(
        internal.userPreferences.getByUserIdInternal,
        { userId: args.userId }
      );
      if (prefs?.emailNotifications?.securityAlerts !== false) {
        await sendEmail(args.userEmail, subject, html, text).catch((err) =>
          console.warn("[EMAIL] Anomaly alert to user failed:", err)
        );
      }
    }

    // Send to all org admins (always)
    const members = await ctx.runQuery(
      internal.organizations.getMembersInternal,
      { organizationId: args.organizationId }
    );

    if (members) {
      for (const member of members) {
        if (!member?.user?.email) continue;
        // Only owners and project managers can view/act on anomalies
        // (matches ORG_ACTIONS["org:view_anomalies"])
        if (roleLevel(member.role) < ROLE_LEVEL.project_manager) continue;
        // Don't send duplicate if the recipient is the affected user
        if (member.user._id === args.userId) continue;

        await sendEmail(member.user.email, subject, html, text).catch((err) =>
          console.warn("[EMAIL] Anomaly alert to admin failed:", err)
        );
      }
    }
  },
});
