"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";

export default function TeamPage() {
  const router = useRouter();
  const { organization } = useAuthContext();

  useEffect(() => {
    if (organization?.slug) {
      router.replace(`/organizations/${organization.slug}/members`);
    }
  }, [organization?.slug, router]);

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
          className="mt-6 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white hover:bg-surface-hover text-ink-inverse hover:bg-surface-hover"
        >
          Manage Organizations
        </Link>
      </div>
    );
  }

  return <TerminalLoading fullPage />;
}
