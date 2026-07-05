"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AuthProvider, useAuthContext } from "@/components/auth/auth-provider";
import {
  Terminal,
  CheckCircle2,
  Clock,
  XCircle,
  Monitor,
  Mail,
  KeyRound,
} from "lucide-react";

export default function CLIAuthPage() {
  return (
    // useSearchParams() in the content requires a Suspense boundary for
    // static prerendering (the root loading.tsx that used to provide one
    // was removed).
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
          <span className="font-mono text-sm text-green-400">
            <span className="text-zinc-500">$</span> authenticating
            <span
              className="inline-block w-2 bg-green-400"
              style={{ animation: "blink 1s step-end infinite" }}
            >
              &nbsp;
            </span>
          </span>
        </div>
      }
    >
      <AuthProvider>
        <CLIAuthPageContent />
      </AuthProvider>
    </Suspense>
  );
}

function CLIAuthPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Get Convex user by WorkOS ID
  const convexUser = useQuery(
    api.users.getByWorkosId,
    user ? { workosId: user.id } : "skip"
  );

  // Get session by code
  const session = useQuery(
    api.cliSessions.getByCode,
    code ? { code: code.toUpperCase() } : "skip"
  );

  // Authenticate mutation
  const authenticate = useMutation(api.cliSessions.authenticate);

  useEffect(() => {
    if (!code || authLoading) {
      return;
    }

    if (!isAuthenticated || !user) {
      // Redirect to sign in with return URL
      const returnUrl = encodeURIComponent(`/cli/auth?code=${code}`);
      window.location.href = `/sign-in?returnUrl=${returnUrl}`;
      return;
    }
  }, [code, isAuthenticated, authLoading, user]);

  const status: "loading" | "confirming" | "success" | "error" | "expired" =
    (() => {
      if (authLoading || isSubmitting) return "loading";
      if (!code) return "error";
      if (convexUser === undefined || session === undefined) return "loading";
      if (!convexUser) return "error";
      if (session === null) return "error";
      if (session.status === "expired") return "expired";
      if (session.status === "authenticated") return "success";
      if (submitError) return "error";
      return "confirming";
    })();

  const errorMessage =
    submitError ??
    (!code
      ? "No authentication code provided"
      : !convexUser
        ? "User not found in database"
        : session === null
          ? "Invalid authentication code"
          : "An error occurred during authentication.");

  const handleConfirm = async () => {
    if (!code || !convexUser) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      // The acting user is derived server-side from the browser's verified JWT
      // identity (requireAuthedUser); no userId is sent. convexUser is still
      // used as a readiness/existence gate above.
      await authenticate({
        code: code.toUpperCase(),
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Authentication failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    window.close();
  };

  if (authLoading || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <span className="font-mono text-sm text-green-400">
          <span className="text-zinc-500">$</span> authenticating
          <span
            className="inline-block w-2 bg-green-400"
            style={{ animation: "blink 1s step-end infinite" }}
          >
            &nbsp;
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f172a] px-4">
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
          <span className="ml-2 text-xs text-zinc-500">cli-auth</span>
        </div>

        <div className="p-6 font-mono text-sm">
          {/* Command header */}
          <p className="text-zinc-500">
            <span className="text-green-400">$</span> envpilot login --authorize
          </p>

          {/* Status-specific content */}
          {status === "confirming" && (
            <>
              <div className="mt-4 border-t border-zinc-700/50 pt-4">
                <p className="text-zinc-300">
                  The Envpilot CLI is requesting access to your account.
                </p>
              </div>

              {/* Session info */}
              <div className="mt-4 space-y-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-500">
                    <Monitor className="h-3.5 w-3.5" />
                    Device
                  </span>
                  <span className="text-zinc-200">
                    {session?.deviceName || "CLI"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-500">
                    <KeyRound className="h-3.5 w-3.5" />
                    Code
                  </span>
                  <span className="font-bold tracking-wider text-green-400">
                    {code?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-zinc-500">
                    <Mail className="h-3.5 w-3.5" />
                    Account
                  </span>
                  <span className="text-zinc-200">{user?.email}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Authorizing..." : "Authorize"}
                </button>
              </div>
            </>
          )}

          {status === "success" && (
            <div className="mt-4 border-t border-zinc-700/50 pt-4">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Authentication Successful</span>
              </div>
              <p className="mt-3 text-zinc-400">
                You can now close this window and return to your terminal.
              </p>
              <div className="mt-4 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-3">
                <p className="text-green-400">
                  ✓ CLI authenticated successfully
                </p>
                <p className="mt-1 text-zinc-500">
                  Session: {code?.toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => window.close()}
                className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
              >
                Close Window
              </button>
            </div>
          )}

          {status === "expired" && (
            <div className="mt-4 border-t border-zinc-700/50 pt-4">
              <div className="flex items-center gap-2 text-[#fbbf24]">
                <Clock className="h-5 w-5" />
                <span className="font-semibold">Code Expired</span>
              </div>
              <p className="mt-3 text-zinc-400">
                The authentication code has expired. Run the login command
                again:
              </p>
              <div className="mt-4 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-3">
                <p className="text-zinc-500">
                  <span className="text-green-400">$</span> envpilot login
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="mt-4 border-t border-zinc-700/50 pt-4">
              <div className="flex items-center gap-2 text-[#ef5350]">
                <XCircle className="h-5 w-5" />
                <span className="font-semibold">Authentication Failed</span>
              </div>
              <p className="mt-3 text-zinc-400">
                {errorMessage || "An error occurred during authentication."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
