"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export function PublicHeaderButtons() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="w-[100px]" />;
  }

  if (isAuthenticated) {
    return (
      <Link
        href="/dashboard"
        className="rounded border border-accent-line bg-accent-soft px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
      >
        dashboard
      </Link>
    );
  }

  return (
    <>
      {/* Plain anchors: these are route handlers that 307 to WorkOS, and a
          client-side Link navigation cannot follow that redirect. */}
      <a
        href="/sign-in"
        className="text-xs text-ink-subtle transition-colors hover:text-accent"
      >
        sign-in
      </a>
      <a
        href="/sign-up"
        className="rounded border border-accent-line bg-accent-soft px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-soft"
      >
        get-started
      </a>
    </>
  );
}
