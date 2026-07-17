import { v, ConvexError } from "convex/values";
import { mutation } from "../../../_generated/server";
import { createAuditLog } from "../../../lib/audit";
import { requireAuthedUser } from "../../../lib/identity";
import {
  assertProjectAction,
  isEnvironmentScopeAllowed,
} from "../../../lib/authz";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countActiveAccounts,
} from "../../featureRegistry/gates";
import { resolveOrgGateContext } from "../../featureRegistry/resolver";
import { getProjectAndOrgRole, canReviewAccountRequests } from "./helpers";

/**
 * Account request mutations — mirror of the variable-request flow
 * (convex/features/variables/requests/mutations.ts) for projectAccounts.
 *
 * R1 lockdown: developers are read+request-only ("project:create_account" is
 * PM/team lead only), so a request reviewed by an owner/PM/team lead is a
 * developer's ONLY path to a new shared account. On approval the reviewer —
 * who passes the lockdown — creates the account and the requester receives a
 * READ grant (never write; further changes go through another request).
 */

export const create = mutation({
  args: {
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    vaultRef: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    // Requester must be assigned to the project (owners bypass assignment)
    const { orgRole, environmentScope } = await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:read"
    );

    if (orgRole !== "developer") {
      throw new ConvexError(
        "Only developers can create account requests — owners, project managers, and team leads can create accounts directly"
      );
    }

    // An account must belong to at least one environment (same rule as
    // accounts.create).
    if (args.environments.length === 0) {
      throw new ConvexError("An account must have at least one environment");
    }

    // Environment scope: scoped developers may only request accounts whose
    // environments all fall inside their assignment scope
    if (!isEnvironmentScopeAllowed(environmentScope, args.environments)) {
      throw new ConvexError(
        `Your access is limited to these environments: ${(environmentScope ?? []).join(", ")}`
      );
    }

    const pendingForName = await ctx.db
      .query("accountRequests")
      .withIndex("by_project_and_name", (q) =>
        q.eq("projectId", args.projectId).eq("name", args.name)
      )
      .collect();

    const hasPendingDuplicate = pendingForName.some(
      (request) =>
        request.requestedBy === actor._id && request.status === "pending"
    );

    if (hasPendingDuplicate) {
      // Keep the phrase "pending request" — API routes map it to HTTP 409
      // (same convention as the variable-request flow).
      throw new ConvexError(
        `You already have a pending request for "${args.name}". Wait for it to be reviewed, or cancel it from the dashboard before requesting again.`
      );
    }

    const requestId = await ctx.db.insert("accountRequests", {
      name: args.name,
      websiteUrl: args.websiteUrl,
      vaultRef: args.vaultRef,
      description: args.description,
      environments: args.environments,
      projectId: args.projectId,
      organizationId: project.organizationId,
      requestedBy: actor._id,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "account.requested",
      details: {
        requestId,
        accountName: args.name,
        environments: args.environments,
      },
      resourceType: "account",
      involvesSensitiveData: true,
    });

    return requestId;
  },
});

export const review = mutation({
  args: {
    requestId: v.id("accountRequests"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reviewReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Account request not found");
    }

    if (request.status !== "pending") {
      throw new ConvexError(`Request has already been ${request.status}`);
    }

    const { project } = await getProjectAndOrgRole(
      ctx,
      request.projectId,
      actor._id
    );

    // Reviewers: owner, or PM/team lead assigned to the project
    const canReview = await canReviewAccountRequests(
      ctx,
      actor._id,
      request.projectId
    );
    if (!canReview) {
      throw new ConvexError(
        "Only owners, project managers, and team leads can review account requests"
      );
    }

    if (args.action === "reject") {
      await ctx.db.patch(args.requestId, {
        status: "rejected",
        reviewReason: args.reviewReason,
        reviewedBy: actor._id,
        reviewedAt: now,
        updatedAt: now,
      });

      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: actor._id,
        action: "account.request_rejected",
        details: {
          requestId: args.requestId,
          accountName: request.name,
          requesterId: request.requestedBy,
          reviewReason: args.reviewReason,
        },
        resourceType: "account",
        involvesSensitiveData: true,
      });

      return {
        requestId: args.requestId,
        status: "rejected" as const,
      };
    }

    // Tier gates: approving must not bypass the caps enforced by
    // accounts.create for direct creation — re-check both at approval time.
    const gate = await resolveOrgGateContext(ctx.db, project.organizationId);

    const boolGate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "shared_accounts",
      gate
    );
    if (!boolGate.allowed) {
      throw new ConvexError(
        boolGate.reason ?? "Shared accounts are not enabled for your tier."
      );
    }

    const numGate = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "shared_accounts_limit",
      (limit) => countActiveAccounts(ctx.db, project.organizationId, limit),
      gate
    );
    if (!numGate.allowed) {
      throw new ConvexError(
        numGate.reason ??
          `Shared account limit reached (${numGate.current}/${numGate.limit}). Upgrade your tier for more.`
      );
    }

    // Create the account AS THE REVIEWER (who passes the R1 lockdown) — same
    // direct-insert shape as the variable-request approval path.
    const accountId = await ctx.db.insert("projectAccounts", {
      name: request.name,
      websiteUrl: request.websiteUrl,
      vaultRef: request.vaultRef,
      description: request.description,
      environments: request.environments,
      projectId: request.projectId,
      createdBy: actor._id,
      lastModifiedBy: actor._id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // LOCKDOWN: the requester gets READ on the account they requested —
    // enough to see and use the credentials. Developers never hold write;
    // further changes go through another request (parity with the
    // variable-request approval grant).
    await ctx.db.insert("accountPermissions", {
      accountId,
      userId: request.requestedBy,
      permission: "read",
      grantedBy: actor._id,
      grantedAt: now,
      isActive: true,
    });

    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewReason: args.reviewReason,
      reviewedBy: actor._id,
      reviewedAt: now,
      createdAccountId: accountId,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      userId: actor._id,
      action: "account.request_approved",
      details: {
        requestId: args.requestId,
        accountName: request.name,
        requesterId: request.requestedBy,
        reviewReason: args.reviewReason,
        accountId,
      },
      resourceType: "account",
      involvesSensitiveData: true,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: project._id,
      userId: actor._id,
      action: "account.created",
      details: {
        accountId,
        accountName: request.name,
        environments: request.environments,
        source: "request_approval",
        requestId: args.requestId,
      },
      resourceType: "account",
      involvesSensitiveData: true,
    });

    return {
      requestId: args.requestId,
      status: "approved" as const,
      accountId,
    };
  },
});

export const cancel = mutation({
  args: {
    requestId: v.id("accountRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Account request not found");
    }

    if (request.status !== "pending") {
      throw new ConvexError(
        `Only pending requests can be canceled (current: ${request.status})`
      );
    }

    await getProjectAndOrgRole(ctx, request.projectId, actor._id);

    // The requester may cancel their own request; otherwise the caller
    // must be a reviewer (owner, or assigned PM/team lead)
    const canCancel =
      request.requestedBy === actor._id ||
      (await canReviewAccountRequests(ctx, actor._id, request.projectId));

    if (!canCancel) {
      throw new ConvexError("Not authorized to cancel this request");
    }

    await ctx.db.patch(args.requestId, {
      status: "canceled",
      reviewedBy: request.requestedBy === actor._id ? undefined : actor._id,
      reviewedAt: now,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      userId: actor._id,
      action: "account.request_canceled",
      details: {
        requestId: args.requestId,
        accountName: request.name,
        requesterId: request.requestedBy,
      },
      resourceType: "account",
      involvesSensitiveData: true,
    });

    return args.requestId;
  },
});
