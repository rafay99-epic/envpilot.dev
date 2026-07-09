import Link from "next/link";

interface AuthErrorPageProps {
  error?: (Error & { digest?: string }) | null;
  title?: string;
  message?: string;
  showTryAgain?: boolean;
}

export function AuthErrorPage({
  error,
  title = "Authentication Error",
  message = "There was a problem verifying your identity. This could be a temporary issue or your session may have expired.",
  showTryAgain = true,
}: AuthErrorPageProps) {
  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      {/* Grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-2xl">
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
          <div className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
          <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
          <span className="ml-2 text-xs text-zinc-500">auth_error</span>
        </div>

        <div className="p-8 font-mono text-sm">
          {/* Error heading */}
          <p className="text-red-400">
            ERROR: {title} [exit code 1]
          </p>
          <p className="mt-2 text-zinc-400">{message}</p>

          {/* Collapsible error details */}
          {error?.message && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-zinc-600 hover:text-zinc-500">
                Error details
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-all text-xs text-zinc-600">
                {error.message}
              </p>
            </details>
          )}

          {/* Error ID */}
          {error?.digest && (
            <p className="mt-3 text-xs text-zinc-600">
              Error ID: {error.digest}
            </p>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap gap-3">
            {showTryAgain && (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
              >
                Try Again
              </Link>
            )}
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
            >
              Sign In Again
            </Link>
          </div>

          {/* Contact support section */}
          <div className="mt-6 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
            <p className="text-xs font-medium text-zinc-300">Need help?</p>
            <p className="mt-1 text-xs text-zinc-500">
              Contact our support team at{" "}
              <a
                href="mailto:syntaxlabtechnology@gmail.com"
                className="text-green-400 underline underline-offset-2 hover:text-green-300"
              >
                syntaxlabtechnology@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
