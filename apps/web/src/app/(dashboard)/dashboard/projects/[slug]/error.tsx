"use client";

import { SegmentError } from "@/components/error/segment-error";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentError
      error={error}
      reset={reset}
      notFoundPattern={/not found|no access|access denied|forbidden/i}
      notFoundTitle="Project not found"
      notFoundMessage="This project doesn't exist, or you don't have access to it."
      genericTitle="Failed to load project"
      genericMessage="There was an error loading this project. Please try again."
      backHref="/dashboard/projects"
      backLabel="Back to Projects"
    />
  );
}
