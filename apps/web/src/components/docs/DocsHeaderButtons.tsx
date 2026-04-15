"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

/**
 * Auth-aware header buttons for the docs pages.
 *
 * - Logged out → "Sign In" + "Get Started"
 * - Logged in  → "Dashboard"
 * - Loading    → empty spacer to prevent layout shift
 *
 * Matches the landing page's PublicHeaderButtons pattern.
 */
export function DocsHeaderButtons() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="w-[120px]" />;
  }

  if (isAuthenticated) {
    return (
      <Link
        href="/dashboard"
        className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20"
      >
        Dashboard
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/sign-in"
        className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        Sign In
      </Link>
      <Link
        href="/sign-up"
        className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20"
      >
        Get Started
      </Link>
    </>
  );
}
