import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

/**
 * Workpool instances for controlled parallelism.
 *
 * Use these to queue work with built-in parallelism limits,
 * preventing resource contention on expensive operations.
 */

/**
 * Pool for cleanup operations (expired tokens, sessions, invitations).
 * Limited parallelism to avoid overwhelming the database with deletions.
 */
export const cleanupPool = new Workpool(components.workpool, {
  maxParallelism: 3,
});
