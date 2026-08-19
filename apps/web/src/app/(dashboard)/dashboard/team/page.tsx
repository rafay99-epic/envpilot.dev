"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import TeamLoading from "./loading";

export default function TeamPage() {
  const router = useRouter();
  const { organization, isLoading: isAuthLoading } = useAuthContext();

  useEffect(() => {
    if (organization?.slug) {
      router.replace(`/organizations/${organization.slug}/members`);
    }
  }, [organization?.slug, router]);

  // The session streams in after the shell paints. Show the route's own
  // skeleton meanwhile: a bare spinner here became the whole static shell and
  // made the navigation stop feeling instant.
  if (isAuthLoading) {
    return <TeamLoading />;
  }

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-lg font-semibold text-ink">
          No active organization
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Select or create an organization to manage team members.
        </p>
        <Link
          href="/organizations"
          className="mt-6 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink-muted"
        >
          Manage Organizations
        </Link>
      </div>
    );
  }

  return <TerminalLoading fullPage />;
}
