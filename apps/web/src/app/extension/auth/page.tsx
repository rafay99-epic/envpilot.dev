"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Terminal } from "lucide-react";

function ExtensionAuthContent() {
  const searchParams = useSearchParams();
  const sessionToken = searchParams.get("session");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function completeAuth() {
      if (!sessionToken) {
        setStatus("error");
        setMessage("No session token provided");
        return;
      }

      try {
        const response = await fetch(
          `/api/extension/auth/callback?session=${sessionToken}`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        if (response.ok) {
          setStatus("success");
          setMessage(
            "Authentication successful! You can now close this window and return to your editor."
          );
        } else {
          const data = await response.json();
          setStatus("error");
          setMessage(data.error || "Authentication failed");
        }
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "An error occurred");
      }
    }

    completeAuth();
  }, [sessionToken]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] p-4">
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
          <div className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
          <div className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
          <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
          <span className="ml-2 text-xs text-ink-subtle">extension-auth</span>
        </div>

        <div className="p-8 text-center">
          <div className="mb-6">
            {status === "loading" && (
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
                <Terminal className="h-8 w-8 animate-pulse text-accent" />
              </div>
            )}
            {status === "success" && (
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
                <CheckCircle className="h-8 w-8 text-accent" />
              </div>
            )}
            {status === "error" && (
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft">
                <XCircle className="h-8 w-8 text-danger" />
              </div>
            )}
          </div>

          <h1 className="font-mono text-xl font-bold text-ink">
            {status === "loading" && "Authenticating..."}
            {status === "success" && "Success!"}
            {status === "error" && "Authentication Failed"}
          </h1>

          <p className="mt-3 text-sm text-ink-muted">{message}</p>

          {status === "success" && (
            <p className="mt-4 font-mono text-xs text-ink-subtle">
              Return to your editor and click &quot;Check Sign In&quot; to
              complete the connection.
            </p>
          )}

          {status === "error" && (
            <button
              onClick={() => window.close()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink-muted"
            >
              Close Window
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExtensionAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
          <span className="font-mono text-sm text-accent">
            <span className="text-ink-subtle">$</span> authenticating
            <span
              className="inline-block w-2 bg-accent"
              style={{ animation: "blink 1s step-end infinite" }}
            >
              &nbsp;
            </span>
          </span>
        </div>
      }
    >
      <ExtensionAuthContent />
    </Suspense>
  );
}
