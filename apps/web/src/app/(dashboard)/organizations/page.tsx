"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { usePagination, useConvexUser } from "@/hooks";
import { useEnforcementEnabled } from "@/hooks/useTierLimits";
import { useFeatureGate } from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { normalizeOrgRole, roleLabel } from "@/lib/roles";
import { Plus, Building2, ChevronRight } from "lucide-react";
import { PageHeader } from "@envpilot/ui";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  role: string;
  createdAt: number;
}

function ProBadge() {
  return (
    <span className="flex-shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
      Pro
    </span>
  );
}

export default function OrganizationsPage() {
  const { user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);

  // Use Convex real-time query directly instead of fetch("/api/organizations")
  const rawOrgs = useQuery(
    api.features.organizations.queries.listForUser,
    convexUserId ? {} : "skip"
  );
  const isLoading = rawOrgs === undefined;
  const organizations: Organization[] = (rawOrgs ?? []) as Organization[];

  const pagination = usePagination(organizations, { pageSize: 9 });
  const enforcing = useEnforcementEnabled();

  // One lean tiers query for ALL orgs (Pro badges) — replaces a per-card
  // useFeatureGate(checkFeature) subscription that resolved the full
  // org→owner→tier chain once per rendered organization.
  const orgTiers = useQuery(
    api.features.featureRegistry.queries.getOrgTiersBatch,
    organizations.length > 0
      ? {
          organizationIds: organizations.map(
            (o) => o._id as Id<"organizations">
          ),
        }
      : "skip"
  );
  const proOrgIds = new Set(
    organizations
      .filter((o, i) => orgTiers?.[i]?.tierName === "pro")
      .map((o) => o._id)
  );

  // Check if org creation is blocked based on tier limits.
  const ownedOrgs = organizations.filter(
    (o) => normalizeOrgRole(o.role) === "owner"
  );
  const firstOwnedOrgId = ownedOrgs[0]?._id;
  const orgLimitGate = useFeatureGate(
    firstOwnedOrgId ? (firstOwnedOrgId as Id<"organizations">) : undefined,
    "max_organizations",
    { currentCount: ownedOrgs.length }
  );
  const maxOrgs =
    typeof orgLimitGate.limit === "number" ? orgLimitGate.limit : null;
  const orgLimitReached = enforcing && !orgLimitGate.allowed;

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Building2}
        title="Organizations"
        description="Manage your organizations and team workspaces."
        actions={
          orgLimitReached ? (
            <span
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-subtle cursor-not-allowed"
              title={`Organization limit reached (${ownedOrgs.length}/${maxOrgs}). Upgrade to Pro for unlimited organizations.`}
            >
              <Plus className="h-4 w-4" />
              New Organization
            </span>
          ) : (
            <Link
              href="/organizations/new"
              className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
            >
              <Plus className="h-4 w-4" />
              New Organization
            </Link>
          )
        }
      />

      {organizations.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface-raised">
            <Building2 className="h-8 w-8 text-ink-subtle" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-ink">
            No organizations yet
          </h3>
          <p className="mt-2 text-sm text-ink-muted">
            Create your first organization to start collaborating with your
            team.
          </p>
          <Link
            href="/organizations/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:border-accent-line hover:bg-accent-soft"
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
                className="group flex flex-col rounded-xl border border-line bg-surface p-6 transition-all hover:border-line-strong hover:bg-surface-hover/80"
              >
                <div className="flex items-start gap-4">
                  {org.logoUrl ? (
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-surface-raised">
                      <span className="text-lg font-semibold text-ink-muted">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-ink">
                        {org.name}
                      </h3>
                      {proOrgIds.has(org._id) && <ProBadge />}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-subtle">
                      {org.slug}
                    </p>
                  </div>
                </div>
                {org.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-ink-muted">
                    {org.description}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      normalizeOrgRole(org.role) === "owner"
                        ? "border border-accent-line bg-accent-soft text-accent"
                        : normalizeOrgRole(org.role) === "project_manager"
                          ? "border border-warning-line bg-warning-soft text-warning"
                          : normalizeOrgRole(org.role) === "team_lead"
                            ? "border border-info-line bg-info-soft text-info"
                            : "border border-line bg-surface-raised text-ink-muted"
                    }`}
                  >
                    {roleLabel(org.role)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-faint transition-transform group-hover:translate-x-1 group-hover:text-ink-muted" />
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
