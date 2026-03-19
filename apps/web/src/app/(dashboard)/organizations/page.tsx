"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { usePagination } from "@/hooks";
import { useEnforcementEnabled } from "@/hooks/useTierLimits";
import { useFeatureGate } from "@/hooks";
import { Plus, Building2, ChevronRight } from "lucide-react";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  role: "admin" | "team_lead" | "member";
  createdAt: number;
}

function OrgProBadge({ orgId }: { orgId: string }) {
  const { tierName } = useFeatureGate(
    orgId as Id<"organizations">,
    "max_projects"
  );
  if (tierName !== "pro") return null;
  return (
    <span className="flex-shrink-0 rounded-full bg-amber-900/30 px-2 py-0.5 text-xs font-medium text-amber-400">
      Pro
    </span>
  );
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pagination = usePagination(organizations, { pageSize: 9 });
  const enforcing = useEnforcementEnabled();

  // Check if org creation is blocked based on tier limits.
  const ownedOrgs = organizations.filter((o) => o.role === "admin");
  const firstOwnedOrgId = ownedOrgs[0]?._id;
  const orgLimitGate = useFeatureGate(
    firstOwnedOrgId ? (firstOwnedOrgId as Id<"organizations">) : undefined,
    "max_organizations",
    { currentCount: ownedOrgs.length }
  );
  const maxOrgs =
    typeof orgLimitGate.limit === "number" ? orgLimitGate.limit : null;
  const orgLimitReached = enforcing && !orgLimitGate.allowed;

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const response = await fetch("/api/organizations");
        if (!response.ok) {
          throw new Error("Failed to fetch organizations");
        }
        const data = await response.json();
        setOrganizations(data.organizations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrganizations();
  }, []);

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="rounded-xl border border-red-800/50 bg-red-900/20 p-6">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Organizations</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your organizations and team workspaces.
          </p>
        </div>
        {orgLimitReached ? (
          <span
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-500 cursor-not-allowed"
            title={`Organization limit reached (${ownedOrgs.length}/${maxOrgs}). Upgrade to Pro for unlimited organizations.`}
          >
            <Plus className="h-4 w-4" />
            New Organization
          </span>
        ) : (
          <Link
            href="/organizations/new"
            className="inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:border-green-500/50 hover:bg-green-500/20"
          >
            <Plus className="h-4 w-4" />
            New Organization
          </Link>
        )}
      </div>

      {organizations.length === 0 ? (
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800">
            <Building2 className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-zinc-100">
            No organizations yet
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            Create your first organization to start collaborating with your
            team.
          </p>
          <Link
            href="/organizations/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:border-green-500/50 hover:bg-green-500/20"
          >
            <Plus className="h-4 w-4" />
            Create Organization
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pagination.pageItems.map((org) => (
              <Link
                key={org._id}
                href={`/organizations/${org.slug}`}
                className="group flex flex-col rounded-xl border border-zinc-700/50 bg-zinc-900 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-800/80"
              >
                <div className="flex items-start gap-4">
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800">
                      <span className="text-lg font-semibold text-zinc-400">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-zinc-100">
                        {org.name}
                      </h3>
                      <OrgProBadge orgId={org._id} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-zinc-500">
                      {org.slug}
                    </p>
                  </div>
                </div>
                {org.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-zinc-400">
                    {org.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      org.role === "admin"
                        ? "border border-green-500/30 bg-green-500/10 text-green-400"
                        : org.role === "team_lead"
                          ? "border border-blue-500/30 bg-blue-500/10 text-blue-400"
                          : "border border-zinc-700 bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {org.role === "team_lead"
                      ? "Team Lead"
                      : org.role.charAt(0).toUpperCase() + org.role.slice(1)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-zinc-400" />
                </div>
              </Link>
            ))}
          </div>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
            onGoToPage={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </>
      )}
    </div>
  );
}
