"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Protected environments for a project: the configured set plus the caller's
 * manage/approve/override capabilities and the tier gate. `undefined` while
 * loading, so callers treat "unknown" as "not protected" and let the server
 * refuse a write it should refuse.
 */
export function useProtection(projectId: Id<"projects"> | undefined) {
  return useQuery(
    api.features.projects.protection.getProtection,
    projectId ? { projectId } : "skip"
  );
}

/**
 * True when a write returned `{ requested: true, requestId }` instead of the
 * created/updated id. Read structurally rather than through the generated
 * union so account and file writes keep compiling until their backends gain
 * the same arm.
 */
export function wasRequested(result: unknown): boolean {
  return typeof result === "object" && result !== null && "requested" in result;
}
