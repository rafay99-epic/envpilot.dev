"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth";

export default function TeamPage() {
  const router = useRouter();
  const { organization } = useAuthContext();

  useEffect(() => {
    if (organization?.id) {
      router.replace(`/organizations/${organization.id}/members`);
    }
  }, [organization?.id, router]);

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          No active organization
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Select or create an organization to manage team members.
        </p>
        <Link
          href="/organizations"
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Manage Organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
    </div>
  );
}
