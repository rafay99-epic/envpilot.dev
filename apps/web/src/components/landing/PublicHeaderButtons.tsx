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
        className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
      >
        dashboard
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/sign-in"
        className="text-xs text-zinc-500 transition-colors hover:text-green-400"
      >
        sign-in
      </Link>
      <Link
        href="/sign-up"
        className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
      >
        get-started
      </Link>
    </>
  );
}
