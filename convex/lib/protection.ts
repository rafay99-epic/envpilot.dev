/**
 * Protected environments: the single enforcement point.
 *
 * Every write path for variables, accounts, and files calls
 * assertProtectedWrite AFTER its capability and environment-scope checks.
 * When any touched environment is protected, the write is refused with
 * PROTECTED_ENVIRONMENT so the caller files a changeRequests row instead.
 * Two ways through: the apply path (viaRequestId, a pending request that a
 * second person approved) and break-glass (override, owner-class
 * capability, audited critical by the caller).
 *
 * Enforcement never consults the feature registry: a downgrade or admin
 * kill switch must not silently unprotect production. Only CONFIGURING
 * protection is tier-gated (projects/protection.ts).
 */

import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getActiveMembership, getRoleProfile, hasCapability } from "./authz";

export const PROTECTED_ENVIRONMENT_CODE = "PROTECTED_ENVIRONMENT";

// A type alias, not an interface: ConvexError's payload must satisfy
// `Value`, and only aliases get the implicit index signature that needs.
export type ProtectedEnvironmentError = {
  code: typeof PROTECTED_ENVIRONMENT_CODE;
  message: string;
  environments: string[];
};

export function isProtectedEnvironmentError(
  data: unknown
): data is ProtectedEnvironmentError {
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === PROTECTED_ENVIRONMENT_CODE
  );
}

/** Environments a write touches: the union of before and after. */
export function touchedEnvironments(
  before: readonly string[] | undefined,
  after: readonly string[] | undefined
): string[] {
  return [...new Set([...(before ?? []), ...(after ?? [])])];
}

/** The subset of `envs` the project protects. Empty means unprotected. */
export function protectedEnvironmentsIn(
  project: Pick<Doc<"projects">, "protection">,
  envs: readonly string[]
): string[] {
  const protectedList = project.protection?.environments ?? [];
  return envs.filter((env) => protectedList.includes(env));
}

export function isProtectedWrite(
  project: Pick<Doc<"projects">, "protection">,
  envs: readonly string[]
): boolean {
  return protectedEnvironmentsIn(project, envs).length > 0;
}

export interface ProtectedWriteArgs {
  project: Doc<"projects">;
  envs: readonly string[];
  actorId: Id<"users">;
  /** What is being written. Binds viaRequestId to this exact resource. */
  resourceType: "variable" | "account" | "file";
  /** The row being written; absent on a create, which has none yet. */
  targetId?: string;
  /** The apply path: a pending change request the reviewer just approved. */
  viaRequestId?: Id<"changeRequests">;
  /** Break-glass. Caller must audit change.overridden when this is used. */
  override?: boolean;
}

/**
 * Refuse a direct write into a protected environment. Returns normally when
 * the write is unprotected, applies an approved request, or is an
 * authorized override.
 */
export async function assertProtectedWrite(
  ctx: MutationCtx | QueryCtx,
  args: ProtectedWriteArgs
): Promise<void> {
  const protectedEnvs = protectedEnvironmentsIn(args.project, args.envs);
  if (protectedEnvs.length === 0) return;

  if (args.viaRequestId) {
    const request = await ctx.db.get(args.viaRequestId);
    if (
      !request ||
      request.projectId !== args.project._id ||
      request.status !== "pending"
    ) {
      throw new ConvexError(
        "This change request is no longer pending, so it cannot be applied"
      );
    }
    // Bound to the exact resource it proposes: a create names no target, and
    // every other kind must name the row being written. Without this a
    // misrouted request id would unlock any protected write in the project.
    const boundTargetId =
      request.kind === "create" ? undefined : request.targetId;
    if (
      request.resourceType !== args.resourceType ||
      boundTargetId !== args.targetId
    ) {
      throw new ConvexError(
        "This change request does not describe the change being applied"
      );
    }
    return;
  }

  if (args.override) {
    const membership = await getActiveMembership(
      ctx,
      args.project.organizationId,
      args.actorId
    );
    const profile = membership
      ? await getRoleProfile(ctx, membership.role)
      : null;
    if (!profile || !hasCapability(profile, "project.protection.override")) {
      throw new ConvexError(
        "Overriding protection needs the break-glass capability. Ask an owner."
      );
    }
    return;
  }

  const list = protectedEnvs.join(", ");
  const error: ProtectedEnvironmentError = {
    code: PROTECTED_ENVIRONMENT_CODE,
    message: `${list} ${protectedEnvs.length === 1 ? "is a protected environment" : "are protected environments"}. Propose this change and a second person will apply it.`,
    environments: protectedEnvs,
  };
  throw new ConvexError(error);
}
