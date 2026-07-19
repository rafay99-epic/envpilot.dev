"use client";

import { SegmentError } from "@/components/error/segment-error";

export default function InvitationError({
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
      notFoundPattern={
        /not found|no access|access denied|forbidden|expired|already accepted|already used/i
      }
      notFoundTitle="Invitation invalid"
      notFoundMessage="This invitation doesn't exist, has expired, or has already been used."
      genericTitle="Failed to load invitation"
      genericMessage="There was an error loading this invitation. Please try again."
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    />
  );
}
