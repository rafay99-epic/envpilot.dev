"use client";

import { useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Building2 } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { setActiveOrganizationCookie } from "@/lib/organization-context";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { useOrganizationBySlug, useOrganizationMemberCount } from "@/hooks";
import {
  normalizeOrgRole,
  roleLabel,
  roleBadgeColor,
  ROLE_FALLBACK_COLOR,
  ROLE_LEVEL,
  roleLevel,
} from "@/lib/roles";

export default function OrganizationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const organization = useOrganizationBySlug(slug);
  const memberCount = useOrganizationMemberCount(organization?._id) ?? 0;

  const tierData = useQuery(
    api.features.featureRegistry.queries.getResolvedFeatures,
    organization?._id
      ? { organizationId: organization._id as Id<"organizations"> }
      : "skip"
  );
  const orgTier = (tierData?.tierName as string) ?? "free";

  useEffect(() => {
    if (organization?._id) setActiveOrganizationCookie(organization._id);
  }, [organization?._id]);

  if (organization === undefined) {
    return <TerminalLoading fullPage />;
  }

  if (!organization) {
    return (
      <div className="space-y-8">
        <div className="rounded-xl border p-6 border-danger-line bg-danger-soft">
          <h3 className="font-semibold text-danger">Error</h3>
          <p className="mt-1 text-sm text-danger">
            Organization not found or you do not have access.
          </p>
          <Link
            href="/organizations"
            className="mt-4 inline-flex items-center gap-1 text-sm hover:underline text-danger"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Organizations
          </Link>
        </div>
      </div>
    );
  }

  const role = normalizeOrgRole(organization.role);
  const isOwner = role === "owner";
  // Developers cannot open the members page — hide the card to match the guard
  const isTeamLeadPlus = roleLevel(role) >= ROLE_LEVEL.team_lead;

  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader
        // The org's own logo (or its initial) — identity, not decoration.
        leading={
          organization.logoUrl ? (
            <img
              src={organization.logoUrl}
              alt={organization.name}
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
              <span className="text-base font-semibold text-ink-muted">
                {organization.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )
        }
        title={organization.name}
        description={
          <>
            {organization.slug}
            {organization.description && (
              <span className="mt-2 block">{organization.description}</span>
            )}
          </>
        }
        actions={
          <>
            {orgTier === "pro" && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                Pro
              </span>
            )}
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${roleBadgeColor(
                ROLE_FALLBACK_COLOR[role] ?? "zinc"
              )}`}
            >
              {roleLabel(role)}
            </span>
          </>
        }
      />

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isTeamLeadPlus && (
          <Link
            href={`/organizations/${slug}/members`}
            className="group flex items-center gap-4 rounded-xl border p-6 transition-[color,background-color,border-color,box-shadow] hover:shadow-md border-line bg-surface hover:border-line"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info-soft text-info">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-ink">Members</h3>
              <p className="text-sm text-ink-muted">
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </p>
            </div>
            <svg
              className="h-5 w-5 text-ink-muted transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        )}

        {isOwner && (
          <Link
            href={`/organizations/${slug}/settings`}
            className="group flex items-center gap-4 rounded-xl border p-6 transition-[color,background-color,border-color,box-shadow] hover:shadow-md border-line bg-surface hover:border-line"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-raised text-ink-muted">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-ink">Settings</h3>
              <p className="text-sm text-ink-muted">Configure organization</p>
            </div>
            <svg
              className="h-5 w-5 text-ink-muted transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        )}

        <button
          onClick={() => {
            if (organization) {
              setActiveOrganizationCookie(organization._id);
            }
            router.push("/dashboard/projects");
            router.refresh();
          }}
          className="group flex items-center gap-4 rounded-xl border p-6 text-left transition-[color,background-color,border-color,box-shadow] hover:shadow-md border-line bg-surface hover:border-line"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-ink">Projects</h3>
            <p className="text-sm text-ink-muted">View all projects</p>
          </div>
          <svg
            className="h-5 w-5 text-ink-muted transition-transform group-hover:translate-x-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Organization Info */}
      <div className="rounded-xl border p-6 border-line bg-surface">
        <h2 className="text-lg font-semibold text-ink">Organization Details</h2>
        <dl className="mt-4 space-y-4">
          <div className="flex justify-between border-b pb-4 border-line">
            <dt className="text-sm text-ink-muted">Created</dt>
            <dd className="text-sm text-ink">
              {new Date(organization.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
          <div className="flex justify-between border-b pb-4 border-line">
            <dt className="text-sm text-ink-muted">Plan</dt>
            <dd className="text-sm text-ink">
              {orgTier === "pro" ? "Pro Plan" : "Free Plan"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-ink-muted">Last Updated</dt>
            <dd className="text-sm text-ink">
              {new Date(organization.updatedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
