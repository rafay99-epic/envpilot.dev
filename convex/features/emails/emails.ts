"use node";

import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { Resend } from "resend";
import {
  CODE_STYLE,
  emailWrapper,
  escapeHtml,
  iconRow,
  headingRow,
  paragraphRow,
  buttonRow,
  footerRow,
} from "./templates";

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

type SendResult = { success: boolean; error?: string; skipped?: boolean };

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<SendResult> {
  // Dev/test kill-switch: on non-prod deployments set the Convex env var
  // DISABLE_EMAILS=true so e2e runs (member updates, session revocations,
  // rotation reminders, …) don't fire real Resend sends and rack up cost /
  // hit sending limits. Prod leaves it unset → real sends. Returns success so
  // callers behave exactly as if the send happened.
  if (process.env.DISABLE_EMAILS === "true") {
    console.log(`[EMAIL] Skipped (DISABLE_EMAILS=true): "${subject}" → ${to}`);
    return { success: true };
  }

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
    // Registry-driven role slug (open set); ROLE_DISPLAY falls back to the
    // slug itself for custom roles.
    role: v.string(),
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
    const roleDisplay =
      ROLE_DISPLAY[args.role] ??
      args.role.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const safeInviter = escapeHtml(args.inviterName);
    const safeOrg = escapeHtml(args.organizationName);
    const orgInitial = args.organizationName.charAt(0).toUpperCase();

    const html = emailWrapper(
      `Invitation to Join ${safeOrg}`,
      [
        iconRow(orgInitial),
        headingRow(`Join ${safeOrg}`),
        paragraphRow(
          `<strong style="color:#e4e4e7;">${safeInviter}</strong> has invited you to join <strong style="color:#e4e4e7;">${safeOrg}</strong> as a <strong style="color:#4ade80;">${roleDisplay}</strong>.`
        ),
        buttonRow(invitationUrl, "Accept Invitation"),
        paragraphRow(
          `This invitation expires on <strong style="color:#a1a1aa;">${expirationDate}</strong>.`,
          "font-size: 14px; color: #71717a;"
        ),
        footerRow(
          `If you didn't expect this invitation, you can safely ignore this email.<br><br>Button not working? Copy this link:<br><a href="${invitationUrl}" style="color: #22c55e; word-break: break-all;">${invitationUrl}</a>`
        ),
      ].join(""),
      `${args.inviterName} invited you to join ${args.organizationName} as a ${roleDisplay} on Envpilot.`
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
      internal.features.users.preferences.getByUserIdInternal,
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
          `<strong>${safeChangedBy}</strong> ${actionWord} <strong>${safeProject}</strong>.<br><br><span style="font-size: 14px; color: #71717a;">Variable: <code style="${CODE_STYLE}">${safeVar}</code></span>`
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
      internal.features.users.preferences.getByUserIdInternal,
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
      internal.features.organizations.queries.getMembersInternal,
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
      ? `The secret <code style="${CODE_STYLE}">${safeVar}</code> in project <strong>${safeProject}</strong> has expired and should be rotated immediately.`
      : `The secret <code style="${CODE_STYLE}">${safeVar}</code> in project <strong>${safeProject}</strong> will expire in <strong>${daysText}</strong> (${expirationDate}).`;

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
      // Only notify roles holding notify.variable_changes — resolved by
      // getMembersInternal (registry-aware, custom roles included).
      if (!member.notifyVariableChanges) continue;

      // Check rotation reminder preference (defaults to true via DEFAULT_NOTIFICATIONS)
      const prefs = await ctx.runQuery(
        internal.features.users.preferences.getByUserIdInternal,
        { userId: member.user._id }
      );
      if (prefs?.emailNotifications?.rotationReminders === false) continue;

      await sendEmail(member.user.email, subject, html, text).catch((err) =>
        console.error("emails.sendRotationReminderEmail.sendFailed", {
          organizationId: args.organizationId,
          variableName: args.variableName,
          projectName: args.projectName,
          reminderType: args.reminderType,
          recipient: member.user.email,
          error: String(err),
        })
      );
    }
  },
});

// ============================================================
// Welcome Email
// ============================================================

export const sendWelcomeEmail = internalAction({
  args: {
    to: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const firstName = (args.name ?? "").trim().split(/\s+/)[0] || "there";
    const config = getEmailConfig();
    const appUrl = config?.appUrl || "http://localhost:3000";

    const subject =
      firstName === "there"
        ? "Welcome to Envpilot"
        : `Welcome to Envpilot, ${firstName}`;

    const greeting =
      firstName !== "there"
        ? `<strong style="color:#e4e4e7;">Hi ${escapeHtml(firstName)}</strong> —`
        : "Hi there —";

    const html = emailWrapper(
      "Welcome to Envpilot",
      [
        iconRow(
          firstName === "there" ? "E" : firstName.charAt(0).toUpperCase()
        ),
        headingRow("Welcome to Envpilot"),
        paragraphRow(
          `${greeting} Abdul Rafay here, CEO of Syntax Lab Technology. Thanks for signing up for Envpilot — really appreciate you giving it a try.`
        ),
        paragraphRow(
          "Envpilot is a secure environment variable management platform for teams. It keeps your secrets encrypted with WorkOS Vault, syncs them across your team, and makes them available in your terminal or editor.<br><br>Here's how to get started:<br>①  Create your first project<br>②  Add environment variables — encrypted with WorkOS Vault<br>③  Invite your team<br>④  Install the CLI (<code style=\"" +
            CODE_STYLE +
            '">npm i -g @envpilot/cli</code>) or the VS Code extension'
        ),
        paragraphRow(
          "The free tier is generous — enough for most small teams. Pro is there when you need more, no pressure.",
          "font-size: 14px; line-height: 1.6; color: #71717a;"
        ),
        paragraphRow(
          "Questions or feedback? Just reply to this email — it reaches a real human.",
          "font-size: 14px; line-height: 1.6; color: #71717a;"
        ),
        buttonRow(appUrl, "Open Envpilot"),
        footerRow(
          `You're receiving this because you created an Envpilot account.<br>Need help? <a href="mailto:support@envpilot.dev" style="color: #22c55e;">support@envpilot.dev</a>`
        ),
      ].join(""),
      "Thanks for signing up — here is how to get started."
    );

    const text = `Welcome to Envpilot

${firstName !== "there" ? `Hi ${firstName} — ` : "Hi there — "}Abdul Rafay here, CEO of Syntax Lab Technology. Thanks for signing up for Envpilot — really appreciate you giving it a try.

Envpilot is a secure environment variable management platform for teams. It keeps your secrets encrypted with WorkOS Vault, syncs them across your team, and makes them available in your terminal or editor.

Here's how to get started:
1) Create your first project
2) Add environment variables — encrypted with WorkOS Vault
3) Invite your team
4) Install the CLI (npm i -g @envpilot/cli) or the VS Code extension

The free tier is generous — enough for most small teams. Pro is there when you need more, no pressure.

Questions or feedback? Just reply to this email — it reaches a real human.

Open Envpilot: ${appUrl}`;

    return sendEmail(args.to, subject, html, text);
  },
});

// ============================================================
// Variable Request Notifications
// ============================================================

export const sendVariableRequestCreatedEmail = internalAction({
  args: {
    projectId: v.id("projects"),
    projectName: v.string(),
    projectSlug: v.string(),
    requesterName: v.string(),
    key: v.string(),
    environments: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Recipients = org owner(s) + PMs/team leads assigned to the project.
    // Resolved (and bounded/deduped) by the query; [] short-circuits the send.
    const recipients = await ctx.runQuery(
      internal.features.variables.requests.queries.getRequestReviewerRecipients,
      { projectId: args.projectId }
    );
    if (recipients.length === 0) return;

    const appUrl = getEmailConfig()?.appUrl || "https://www.envpilot.dev";
    const link = `${appUrl}/dashboard/projects/${args.projectSlug}`;
    const envText = args.environments.join(", ");

    const safeKey = escapeHtml(args.key);
    const safeProject = escapeHtml(args.projectName);
    const safeRequester = escapeHtml(args.requesterName);
    const safeEnv = escapeHtml(envText);

    const subject = `New variable request: ${args.key} for ${envText} in ${args.projectName} by ${args.requesterName}`;

    const html = emailWrapper(
      "New Variable Request",
      [
        iconRow(args.projectName.charAt(0).toUpperCase()),
        headingRow("New Variable Request"),
        paragraphRow(
          `<strong>${safeRequester}</strong> requested the variable <code style="${CODE_STYLE}">${safeKey}</code> for <strong>${safeEnv}</strong> in <strong>${safeProject}</strong>.`
        ),
        buttonRow(link, "Review Request"),
        footerRow(
          `You received this because you can review variable requests for this project.<br><br>Link not working? Copy this:<br><a href="${link}" style="color: #22c55e; word-break: break-all;">${link}</a>`
        ),
      ].join(""),
      `${args.requesterName} requested ${args.key} for ${envText} in ${args.projectName}.`
    );

    const text = `New Variable Request\n\n${args.requesterName} requested the variable ${args.key} for ${envText} in ${args.projectName}.\n\nReview it: ${link}`;

    for (const recipient of recipients) {
      await sendEmail(recipient.email, subject, html, text).catch((err) =>
        console.error("emails.sendVariableRequestCreatedEmail.sendFailed", {
          projectId: args.projectId,
          key: args.key,
          recipient: recipient.email,
          error: String(err),
        })
      );
    }
  },
});

export const sendVariableRequestReviewedEmail = internalAction({
  args: {
    to: v.string(),
    requesterName: v.optional(v.string()),
    key: v.string(),
    projectName: v.string(),
    verdict: v.union(v.literal("approved"), v.literal("rejected")),
    reviewerName: v.string(),
    reviewReason: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const approved = args.verdict === "approved";
    const safeKey = escapeHtml(args.key);
    const safeProject = escapeHtml(args.projectName);
    const safeReviewer = escapeHtml(args.reviewerName);

    const heading = approved
      ? "Variable Request Approved"
      : "Variable Request Rejected";
    const subject = `Your variable request ${args.key} was ${args.verdict}`;

    const verdictLine = approved
      ? `Your request for <code style="${CODE_STYLE}">${safeKey}</code> in <strong>${safeProject}</strong> was <strong style="color:#4ade80;">approved</strong> by ${safeReviewer}. The variable is now available.`
      : `Your request for <code style="${CODE_STYLE}">${safeKey}</code> in <strong>${safeProject}</strong> was <strong style="color:#f87171;">rejected</strong> by ${safeReviewer}.`;

    const rows = [
      iconRow(
        args.projectName.charAt(0).toUpperCase(),
        approved ? undefined : "#dc2626"
      ),
      headingRow(heading),
      paragraphRow(verdictLine),
    ];
    if (args.reviewReason) {
      rows.push(
        paragraphRow(
          `Note: ${escapeHtml(args.reviewReason)}`,
          "font-size: 14px; line-height: 1.5; color: #71717a;"
        )
      );
    }
    rows.push(
      footerRow(
        "You received this because you submitted this variable request."
      )
    );

    const html = emailWrapper(heading, rows.join(""));

    const text = `${heading}\n\nYour request for ${args.key} in ${args.projectName} was ${args.verdict} by ${args.reviewerName}.${
      args.reviewReason ? `\n\nNote: ${args.reviewReason}` : ""
    }`;

    return sendEmail(args.to, subject, html, text);
  },
});

/**
 * "X shared a documentation page with you" — the internal audience.
 *
 * Carries a deep link and no token: the recipient is an authenticated member
 * and the grant lives in the database, not in the URL.
 */
export const sendDocSharedEmail = internalAction({
  args: {
    recipients: v.array(v.object({ email: v.string(), name: v.string() })),
    docTitle: v.string(),
    /** Set for a MODULE share — how many published pages it covers. */
    pageCount: v.optional(v.number()),
    projectName: v.string(),
    sharedByName: v.string(),
    note: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.recipients.length === 0) return;

    const appUrl = getEmailConfig()?.appUrl || "https://www.envpilot.dev";
    const link = `${appUrl}/dashboard/docs/shared`;
    const expires = new Date(args.expiresAt).toUTCString();

    const safeTitle = escapeHtml(args.docTitle);
    const safeProject = escapeHtml(args.projectName);
    const safeSharer = escapeHtml(args.sharedByName);

    // A module share is ONE message covering N pages — never one per page.
    const isModule = args.pageCount !== undefined;
    const pages =
      args.pageCount === 1 ? "1 page" : `${args.pageCount ?? 0} pages`;

    const subject = isModule
      ? `${args.sharedByName} shared the "${args.docTitle}" documentation with you`
      : `${args.sharedByName} shared "${args.docTitle}" with you`;

    const rows = [
      iconRow(args.projectName.charAt(0).toUpperCase()),
      headingRow(
        isModule
          ? "A documentation module was shared with you"
          : "A documentation page was shared with you"
      ),
      paragraphRow(
        isModule
          ? `<strong>${safeSharer}</strong> shared the <strong>${safeTitle}</strong> module from <strong>${safeProject}</strong> with you — ${pages} today, and anything published into it later.`
          : `<strong>${safeSharer}</strong> shared <strong>${safeTitle}</strong> from <strong>${safeProject}</strong> with you.`
      ),
    ];
    if (args.note) {
      rows.push(
        paragraphRow(
          `“${escapeHtml(args.note)}”`,
          "font-size: 14px; line-height: 1.5; color: #a1a1aa; font-style: italic;"
        )
      );
    }
    rows.push(
      buttonRow(link, isModule ? "Read the documentation" : "Read the page"),
      paragraphRow(
        `Access expires on ${escapeHtml(expires)}.`,
        "font-size: 13px; line-height: 1.5; color: #71717a;"
      ),
      footerRow(
        `You received this because a teammate shared documentation with you. It gives you access to what they shared and nothing else.<br><br>Link not working? Copy this:<br><a href="${link}" style="color: #22c55e; word-break: break-all;">${link}</a>`
      )
    );

    const html = emailWrapper(
      "Documentation shared with you",
      rows.join(""),
      `${args.sharedByName} shared ${args.docTitle} from ${args.projectName} with you.`
    );

    const text = `${args.sharedByName} shared ${isModule ? `the "${args.docTitle}" module (${pages})` : `"${args.docTitle}"`} from ${args.projectName} with you.${
      args.note ? `\n\n"${args.note}"` : ""
    }\n\nRead it: ${link}\n\nAccess expires on ${expires}.`;

    for (const recipient of args.recipients) {
      await sendEmail(recipient.email, subject, html, text).catch((err) =>
        console.error("emails.sendDocSharedEmail.sendFailed", {
          docTitle: args.docTitle,
          recipient: recipient.email,
          error: String(err),
        })
      );
    }
  },
});

/**
 * A public preview link, mailed to someone outside the organization.
 *
 * The passphrase is NEVER in this email. Mailing both factors down the same
 * channel would make the second one decorative — the sender passes it on
 * separately, and the copy says so.
 */
export const sendDocLinkEmail = internalAction({
  args: {
    to: v.string(),
    token: v.string(),
    docTitle: v.string(),
    /** Set for a MODULE link — how many published pages it covers. */
    pageCount: v.optional(v.number()),
    projectName: v.string(),
    sharedByName: v.string(),
    note: v.optional(v.string()),
    hasPassphrase: v.boolean(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Built here rather than passed in: one place owns the shape of a public
    // documentation URL, and it is the same place that owns every other link
    // this module sends.
    const appUrl = getEmailConfig()?.appUrl || "https://www.envpilot.dev";
    const url = `${appUrl}/d/${args.token}`;

    const expires = new Date(args.expiresAt).toUTCString();
    const safeTitle = escapeHtml(args.docTitle);
    const safeProject = escapeHtml(args.projectName);
    const safeSharer = escapeHtml(args.sharedByName);
    const safeUrl = escapeHtml(url);

    // One link, one message — whether it opens a page or a whole module.
    const isModule = args.pageCount !== undefined;
    const pages =
      args.pageCount === 1 ? "1 page" : `${args.pageCount ?? 0} pages`;

    const subject = isModule
      ? `${args.sharedByName} shared documentation with you: ${args.docTitle}`
      : `${args.sharedByName} shared a document with you: ${args.docTitle}`;

    const rows = [
      iconRow(args.projectName.charAt(0).toUpperCase()),
      headingRow(
        isModule
          ? "Documentation was shared with you"
          : "A document was shared with you"
      ),
      paragraphRow(
        isModule
          ? `<strong>${safeSharer}</strong> shared the <strong>${safeTitle}</strong> documentation from <strong>${safeProject}</strong> with you — ${pages}.`
          : `<strong>${safeSharer}</strong> shared <strong>${safeTitle}</strong> from <strong>${safeProject}</strong> with you.`
      ),
    ];
    if (args.note) {
      rows.push(
        paragraphRow(
          `“${escapeHtml(args.note)}”`,
          "font-size: 14px; line-height: 1.5; color: #a1a1aa; font-style: italic;"
        )
      );
    }
    rows.push(
      buttonRow(url, isModule ? "Open the documentation" : "Open the document")
    );
    if (args.hasPassphrase) {
      rows.push(
        paragraphRow(
          "This link is passphrase protected. The sender will give you the passphrase separately — it is deliberately not in this email.",
          "font-size: 13px; line-height: 1.5; color: #fbbf24;"
        )
      );
    }
    rows.push(
      paragraphRow(
        `The link stops working on ${escapeHtml(expires)}.`,
        "font-size: 13px; line-height: 1.5; color: #71717a;"
      ),
      footerRow(
        `You received this because someone shared a document with you.<br><br>Link not working? Copy this:<br><a href="${safeUrl}" style="color: #22c55e; word-break: break-all;">${safeUrl}</a>`
      )
    );

    const html = emailWrapper(
      "A document was shared with you",
      rows.join(""),
      `${args.sharedByName} shared ${args.docTitle} with you.`
    );

    const text = `${args.sharedByName} shared ${isModule ? `the "${args.docTitle}" module (${pages})` : `"${args.docTitle}"`} from ${args.projectName} with you.${
      args.note ? `\n\n"${args.note}"` : ""
    }\n\nOpen it: ${url}${
      args.hasPassphrase
        ? "\n\nThis link is passphrase protected. The sender will give you the passphrase separately."
        : ""
    }\n\nThe link stops working on ${expires}.`;

    return sendEmail(args.to, subject, html, text);
  },
});
