import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4">
      {/* Grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface/90 shadow-2xl">
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-danger/80" />
          <div className="h-3 w-3 rounded-full bg-warning/80" />
          <div className="h-3 w-3 rounded-full bg-accent/80" />
          <span className="ml-2 text-xs text-ink-subtle">not-found</span>
        </div>

        <div className="p-8 font-mono text-sm">
          <p className="text-ink-subtle">
            <span className="text-accent">$</span> curl -I /unknown-page
          </p>
          <div className="mt-4 space-y-1">
            <p className="text-danger">HTTP/1.1 404 Not Found</p>
            <p className="text-ink-subtle">Content-Type: text/html</p>
          </div>
          <div className="mt-6 border-t border-line pt-6">
            <p className="text-4xl font-bold text-ink">404</p>
            <p className="mt-1 text-ink-muted">
              The page you&apos;re looking for doesn&apos;t exist or has been
              moved.
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              Go Home
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink-muted"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
