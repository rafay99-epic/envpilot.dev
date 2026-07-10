import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/**
 * Batch fetch users by their IDs to avoid N+1 query patterns.
 * Deduplicates IDs and returns a Map for O(1) lookup.
 */
export async function batchGetUsers(
  ctx: QueryCtx | MutationCtx,
  userIds: (Id<"users"> | undefined | null)[]
): Promise<Map<string, Doc<"users">>> {
  const validIds = userIds.filter(
    (id): id is Id<"users"> => id !== undefined && id !== null
  );
  const uniqueIds = [...new Set(validIds.map((id) => id.toString()))];

  const users = await Promise.all(
    uniqueIds.map((id) => ctx.db.get(id as Id<"users">))
  );

  const map = new Map<string, Doc<"users">>();
  for (const user of users) {
    if (user) {
      map.set(user._id.toString(), user);
    }
  }
  return map;
}

/**
 * Helper to extract user display info from a user document.
 */
export function userInfo(user: Doc<"users"> | undefined | null) {
  if (!user) return null;
  return { _id: user._id, name: user.name, email: user.email };
}

/**
 * Helper to extract user name/email for audit log enrichment.
 */
export function userDisplay(user: Doc<"users"> | undefined | null) {
  return {
    userName: user?.name ?? user?.email ?? "Unknown",
    userEmail: user?.email ?? "Unknown",
  };
}
