"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Live progress for the project's most recent bulk vault operation
 * (template provisioning, import, export).
 *
 * Reactive: Convex pushes every counter bump over the existing socket, so
 * there is no polling and no refetch-after-mutate to get wrong. Returns
 * `undefined` while loading and `null` when the project has never run one.
 */
export function useBulkJob(projectId: Id<"projects"> | undefined) {
  return useQuery(
    api.features.variables.bulkJobs.latestForProject,
    projectId ? { projectId } : "skip"
  );
}
