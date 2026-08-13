"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "./auth-provider";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Action strings from convex/authz.ts (e.g. "org:create_project") */
  requiredActions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  redirectTo?: string;
}

/**
 * Client-side route protection component
 * For server-side protection, use middleware or getUser() in server components
 */
export function ProtectedRoute({
  children,
  requiredActions = [],
  requireAll = true,
  fallback,
  redirectTo = "/sign-in",
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, canDo } = useAuthContext();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  // Show loading state
  if (isLoading) {
    return (
      fallback ?? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-line" />
        </div>
      )
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Check actions if required
  if (requiredActions.length > 0) {
    const hasRequiredActions = requireAll
      ? requiredActions.every((a) => canDo(a))
      : requiredActions.some((a) => canDo(a));

    if (!hasRequiredActions) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <div className="rounded-full bg-danger-soft p-4 bg-danger-soft">
            <svg
              className="h-8 w-8 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-ink">
            Access Denied
          </h2>
          <p className="text-sm text-ink-muted">
            You don&apos;t have permission to view this page.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface-hover text-ink-inverse hover:bg-surface-hover"
          >
            Go Back
          </button>
        </div>
      );
    }
  }

  return <>{children}</>;
}
