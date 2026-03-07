"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ExtensionAuthContent() {
  const searchParams = useSearchParams();
  const sessionToken = searchParams.get("session");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
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
        // Call the callback endpoint to complete the auth
        const response = await fetch(
          `/api/extension/auth/callback?session=${sessionToken}`,
          {
            method: "POST",
            credentials: "include",
          },
        );

        if (response.ok) {
          setStatus("success");
          setMessage(
            "Authentication successful! You can now close this window and return to your editor.",
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
            {status === "loading" && (
              <svg
                className="w-8 h-8 text-blue-600 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {status === "success" && (
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {status === "error" && (
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {status === "loading" && "Authenticating..."}
          {status === "success" && "Success!"}
          {status === "error" && "Authentication Failed"}
        </h1>

        <p className="text-gray-600 mb-6">{message}</p>

        {status === "success" && (
          <p className="text-sm text-gray-500">
            Return to your editor and click &quot;Check Sign In&quot; to
            complete the connection.
          </p>
        )}

        {status === "error" && (
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Close Window
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExtensionAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      <ExtensionAuthContent />
    </Suspense>
  );
}
