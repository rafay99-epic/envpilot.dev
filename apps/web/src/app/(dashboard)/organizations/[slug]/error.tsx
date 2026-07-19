"use client";

import { SegmentError } from "@/components/error/segment-error";

export default function OrganizationError({
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
      notFoundTitle="Organization not found"
      notFoundMessage="This organization doesn't exist, or you don't have access to it."
      genericTitle="Failed to load organization"
      genericMessage="There was an error loading this organization. Please try again."
      backHref="/organizations"
      backLabel="Back to Organizations"
    />
  );
}
