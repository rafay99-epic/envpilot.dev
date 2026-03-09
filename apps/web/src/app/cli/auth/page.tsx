"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AuthProvider, useAuthContext } from "@/components/auth/auth-provider";

export default function CLIAuthPage() {
  return (
    <AuthProvider>
      <CLIAuthPageContent />
    </AuthProvider>
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
    user ? { workosId: user.id } : "skip",
  );

  // Get session by code
  const session = useQuery(
    api.cliSessions.getByCode,
    code ? { code: code.toUpperCase() } : "skip",
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
      await authenticate({
        code: code.toUpperCase(),
        userId: convexUser._id,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Authentication failed",
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            CLI Authentication
          </h1>
        </div>

        {/* Status-specific content */}
        {status === "confirming" && (
          <>
            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-400 text-center">
                The ENV Connect CLI is requesting access to your account.
              </p>
            </div>

            {/* Session info */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Device
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {session?.deviceName || "CLI"}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Code
                </span>
                <span className="text-sm font-mono font-bold text-gray-900 dark:text-white tracking-wider">
                  {code?.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Account
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {user?.email}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {isSubmitting ? "Authorizing..." : "Authorize"}
              </button>
            </div>
          </>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Authentication Successful
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You can now close this window and return to your terminal.
            </p>
            <button
              onClick={() => window.close()}
              className="px-6 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              Close Window
            </button>
          </div>
        )}

        {status === "expired" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Code Expired
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              The authentication code has expired. Please run{" "}
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                env-connect login
              </code>{" "}
              again to get a new code.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Authentication Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {errorMessage || "An error occurred during authentication."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
