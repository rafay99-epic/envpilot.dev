import {
  TerminalWindow,
  TerminalButton,
  TerminalButtonLink,
} from "@/components/dashboard/terminal-ui";

interface AuthErrorPageProps {
  error?: (Error & { digest?: string }) | null;
  title?: string;
  message?: string;
  showTryAgain?: boolean;
  /**
   * Resets the owning error boundary. When omitted (e.g. rendered directly
   * from a server layout), "Try Again" falls back to a /dashboard link.
   */
  onRetry?: () => void;
}

export function AuthErrorPage({
  error,
  title = "Authentication Error",
  message = "There was a problem verifying your identity. This could be a temporary issue or your session may have expired.",
  showTryAgain = true,
  onRetry,
}: AuthErrorPageProps) {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      {/* Subtle grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <TerminalWindow
        title="auth_error"
        className="relative z-10 w-full max-w-md shadow-2xl"
      >
        <div className="p-8 font-mono text-sm">
          <p className="text-red-400">ERROR: {title} [exit code 1]</p>
          <p className="mt-2 text-zinc-400">{message}</p>

          {/* Raw error text is dev-only: production server errors must stay
              redacted (digest below is the user-facing correlation ID). */}
          {process.env.NODE_ENV === "development" && error?.message && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-500">
                Error details (dev only)
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-all text-xs text-zinc-600">
                {error.message}
              </p>
            </details>
          )}

          {error?.digest && (
            <p className="mt-3 text-xs text-zinc-600">
              Error ID: {error.digest}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {showTryAgain &&
              (onRetry ? (
                <TerminalButton onClick={onRetry}>Try Again</TerminalButton>
              ) : (
                <TerminalButtonLink href="/dashboard">
                  Try Again
                </TerminalButtonLink>
              ))}
            <TerminalButtonLink variant="secondary" href="/sign-in">
              Sign In Again
            </TerminalButtonLink>
          </div>

          <div className="mt-6 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
            <p className="text-xs font-medium text-zinc-300">Need help?</p>
            <p className="mt-1 text-xs text-zinc-500">
              Contact our support team at{" "}
              <a
                href="mailto:support@envpilot.dev"
                className="text-green-400 underline underline-offset-2 hover:text-green-300"
              >
                support@envpilot.dev
              </a>
            </p>
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
}
