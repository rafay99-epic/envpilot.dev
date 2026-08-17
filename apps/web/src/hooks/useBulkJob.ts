"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createLogger } from "@/lib/logger";

const log = createLogger("variables/bulk-job");

/**
 * Live progress for the project's most recent bulk vault operation
 * (template provisioning, import, export).
 *
 * Reactive: Convex pushes every counter bump over the existing socket, so
 * there is no polling and no refetch-after-mutate to get wrong. Returns
 * `undefined` while loading and `null` when the project has never run one.
 *
 * This hook is also where a failed batch gets REPORTED. Convex has no Sentry
 * of its own, so the backend's job is to put the reason somewhere the client
 * can see it — the `bulkJobs` row — and the client's job is to forward it.
 * That matters most for template provisioning, because it runs in a workflow:
 * nothing the browser awaited threw, so without this a failure would exist
 * only as a banner the user can dismiss.
 */
export function useBulkJob(projectId: Id<"projects"> | undefined) {
  const job = useQuery(
    api.features.variables.bulkJobs.latestForProject,
    projectId ? { projectId } : "skip"
  );

  // One report per job, not one per render. A ref rather than state because
  // nothing about having reported should cause a re-render.
  const reportedJobId = useRef<Id<"bulkJobs"> | null>(null);

  useEffect(() => {
    if (!job || job.status !== "failed") return;
    if (reportedJobId.current === job._id) return;
    reportedJobId.current = job._id;

    // Counts and ids only. The reason comes from the backend and is already
    // a user-facing message, never a value.
    log.error(
      "bulk_job_failed",
      {
        projectId,
        jobId: job._id,
        kind: job.kind,
        total: job.total,
        completed: job.completed,
        failed: job.failed,
      },
      new Error(job.error ?? "bulk vault operation failed")
    );
  }, [job, projectId]);

  return job;
}
