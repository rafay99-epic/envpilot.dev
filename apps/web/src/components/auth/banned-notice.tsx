/**
 * Shown in place of the dashboard when the signed-in account is suspended.
 *
 * Lifted out of the dashboard layout when the session moved to a streamed
 * promise: the layout can no longer return a different tree mid-render, so
 * the state travels as data and the provider picks the screen.
 */
export function BannedNotice({ reason }: { reason: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-ink">
      <div className="mx-auto max-w-md rounded-lg border border-danger-line bg-danger-soft p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft">
          <svg
            className="h-6 w-6 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-semibold text-danger">
          Account Suspended
        </h1>
        <p className="mb-4 text-sm text-ink-muted">
          Your account has been suspended.
          {reason && (
            <span className="mt-2 block text-ink-subtle">Reason: {reason}</span>
          )}
        </p>
        <p className="text-xs text-ink-subtle">
          If you believe this is a mistake, please contact support.
        </p>
      </div>
    </div>
  );
}
