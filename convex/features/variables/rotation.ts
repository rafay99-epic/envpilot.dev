import { v } from "convex/values";
import { query, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { isCronPaused } from "../billing/tierLimits";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createAuditLog } from "../../lib/audit";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
  hasCapability,
} from "../../lib/authz";

/**
 * Environment Variable Secret Rotation & Expiry
 */

// ==========================================
// SECRET ROTATION & EXPIRY
// ==========================================

/**
 * List variables expiring within 7 days for the dashboard widget.
 */
export const listExpiringVariables = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Verify caller is an ACTIVE member of the organization (suspended → none).
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return [];

    const rotationCheck = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "secret_rotation"
    );
    if (!rotationCheck.allowed) return [];

    const orgRole = normalizeOrgRole(membership.role);
    const rotationProfile = await getRoleProfile(ctx, orgRole);
    const isOwner = bypassesAssignment(rotationProfile);

    // Non-owners only see expiring variables in projects they're assigned to,
    // and developers are further constrained by their environment scope.
    const scopeByProject = new Map<string, string[] | undefined>();
    const assignedProjectIds = new Set<string>();
    if (!isOwner) {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      for (const pm of assignments) {
        assignedProjectIds.add(pm.projectId as string);
        scopeByProject.set(pm.projectId as string, pm.environments);
      }
    }

    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    // Map accessible (live + owner/assigned) projects for O(1) lookup by id.
    const accessibleProjects = new Map<string, Doc<"projects">>();
    for (const project of allProjects) {
      if (project.deletedAt !== undefined) continue;
      if (isOwner || assignedProjectIds.has(project._id as string)) {
        accessibleProjects.set(project._id as string, project);
      }
    }

    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const resultLimit = args.limit ?? 100;

    // Read ONLY variables whose expiry falls in the next 7 days via the
    // by_expires_at index, instead of collecting every variable in every
    // accessible project. `.gt(0)` skips rows with no expiry (undefined sorts
    // before 0). The range is a narrow time window so it stays small; we then
    // filter to this caller's accessible projects and env scope.
    const expiringDocs = await ctx.db
      .query("environmentVariables")
      .withIndex("by_expires_at", (q) =>
        q.gt("expiresAt", 0).lte("expiresAt", sevenDaysFromNow)
      )
      .collect();

    const results: Array<{
      _id: Id<"environmentVariables">;
      key: string;
      projectName: string;
      projectId: Id<"projects">;
      expiresAt: number;
      rotationStatus: string;
      rotationFrequencyDays: number;
    }> = [];

    for (const variable of expiringDocs) {
      if (variable.deletedAt !== undefined) continue;
      if (!variable.rotationFrequencyDays) continue;
      if (variable.expiresAt === undefined) continue;

      const project = accessibleProjects.get(variable.projectId as string);
      if (!project) continue;

      // Scoped developers never receive out-of-scope variables.
      const environmentScope = hasCapability(
        rotationProfile,
        "access.env_scoped"
      )
        ? scopeByProject.get(variable.projectId as string)
        : undefined;
      if (!isEnvironmentScopeAllowed(environmentScope, variable.environments)) {
        continue;
      }

      results.push({
        _id: variable._id,
        key: variable.key,
        projectName: project.name,
        projectId: project._id,
        expiresAt: variable.expiresAt,
        rotationStatus: variable.rotationStatus ?? "active",
        rotationFrequencyDays: variable.rotationFrequencyDays,
      });
    }

    return results
      .sort((a, b) => a.expiresAt - b.expiresAt)
      .slice(0, resultLimit);
  },
});

/**
 * Internal mutation called by the hourly cron to process
 * rotation expiry — transitions statuses and sends reminder emails.
 */
export const processRotationExpiry = internalMutation({
  handler: async (ctx) => {
    // Check if this cron is paused from admin panel
    const paused = await isCronPaused(ctx.db, "cron_pause_rotation_expiry");
    if (paused) return;

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    // Only variables with an expiry set AND already within the 7-day horizon
    // can trigger any status transition or reminder below (expired ≤ now,
    // expiring_soon ≤ now+7d, 1-day reminder ⊂ expiring_soon). Bound the read
    // tightly via the by_expires_at index instead of scanning the whole table
    // hourly. `.gt(0)` excludes rows where expiresAt is undefined (they sort
    // before 0), so non-rotating variables are never read.
    const expiryHorizon = now + sevenDays;
    const expiringDocs = await ctx.db
      .query("environmentVariables")
      .withIndex("by_expires_at", (q) =>
        q.gt("expiresAt", 0).lte("expiresAt", expiryHorizon)
      )
      .collect();

    // deletedAt is an optional field, so the non-deleted check happens in JS.
    // rotationFrequencyDays must be a live rotation schedule.
    const rotatingVariables = expiringDocs.filter(
      (v) =>
        v.deletedAt === undefined &&
        v.expiresAt !== undefined &&
        v.rotationFrequencyDays !== undefined &&
        v.rotationFrequencyDays > 0
    );

    let expired = 0;
    let expiringSoon = 0;

    for (const variable of rotatingVariables) {
      const expiresAt = variable.expiresAt!;

      // Expired: transition to "expired"
      if (expiresAt <= now && variable.rotationStatus !== "expired") {
        const patchData: Record<string, unknown> = {
          rotationStatus: "expired",
          updatedAt: now,
        };

        const project = await ctx.db.get(variable.projectId);
        if (project) {
          await createAuditLog(ctx, {
            organizationId: project.organizationId,
            projectId: variable.projectId,
            variableId: variable._id,
            userId: variable.lastModifiedBy,
            action: "variable.expired",
            details: {
              key: variable.key,
              expiresAt,
              rotationFrequencyDays: variable.rotationFrequencyDays,
              automated: true,
            },
            resourceType: "variable",
            severity: "warning",
          });

          // Send expiry email if not already reminded recently
          if (
            !variable.lastReminderSentAt ||
            now - variable.lastReminderSentAt > oneDay
          ) {
            patchData.lastReminderSentAt = now;
            await ctx.scheduler.runAfter(
              0,
              internal.features.emails.emails.sendRotationReminderEmail,
              {
                variableName: variable.key,
                projectName: project.name,
                organizationId: project.organizationId,
                expiresAt,
                reminderType: "expired" as const,
              }
            );
          }
        }
        await ctx.db.patch(variable._id, patchData);
        expired++;
        continue;
      }

      // Expiring soon: transition to "expiring_soon"
      if (
        expiresAt <= now + sevenDays &&
        expiresAt > now &&
        variable.rotationStatus === "active"
      ) {
        const patchData: Record<string, unknown> = {
          rotationStatus: "expiring_soon",
          updatedAt: now,
        };

        const project = await ctx.db.get(variable.projectId);
        if (project) {
          // Send 7-day reminder if not already sent
          if (
            !variable.lastReminderSentAt ||
            now - variable.lastReminderSentAt > oneDay
          ) {
            patchData.lastReminderSentAt = now;
            await ctx.scheduler.runAfter(
              0,
              internal.features.emails.emails.sendRotationReminderEmail,
              {
                variableName: variable.key,
                projectName: project.name,
                organizationId: project.organizationId,
                expiresAt,
                reminderType: "7_days" as const,
              }
            );
          }
        }
        await ctx.db.patch(variable._id, patchData);
        expiringSoon++;
        continue;
      }

      // 1-day reminder for already "expiring_soon" variables
      if (
        variable.rotationStatus === "expiring_soon" &&
        expiresAt <= now + oneDay &&
        expiresAt > now
      ) {
        const project = await ctx.db.get(variable.projectId);
        if (
          project &&
          (!variable.lastReminderSentAt ||
            now - variable.lastReminderSentAt > oneDay)
        ) {
          await ctx.db.patch(variable._id, { lastReminderSentAt: now });
          await ctx.scheduler.runAfter(
            0,
            internal.features.emails.emails.sendRotationReminderEmail,
            {
              variableName: variable.key,
              projectName: project.name,
              organizationId: project.organizationId,
              expiresAt,
              reminderType: "1_day" as const,
            }
          );
        }
      }
    }

    return { processed: rotatingVariables.length, expired, expiringSoon };
  },
});
