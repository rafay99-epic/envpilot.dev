"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { setActiveOrganizationCookie } from "@/lib/organization-context";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { normalizeOrgRole, ORG_ROLE_LABELS } from "@/lib/roles";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  role: string;
  createdAt: number;
  updatedAt: number;
}

export default function OrganizationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tierData = useQuery(
    api.featureRegistry.getResolvedFeatures,
    organization?._id
      ? { organizationId: organization._id as Id<"organizations"> }
      : "skip"
  );
  const orgTier = (tierData?.tierName as string) ?? "free";

  useEffect(() => {
    async function fetchOrganization() {
      try {
        const [orgRes, membersRes] = await Promise.all([
          fetch(`/api/organizations/${slug}`),
          fetch(`/api/organizations/${slug}/members`),
        ]);

        if (!orgRes.ok) {
          if (orgRes.status === 404) {
            throw new Error("Organization not found");
          }
          if (orgRes.status === 403) {
            throw new Error("You do not have access to this organization");
          }
          throw new Error("Failed to fetch organization");
        }

        const orgData = await orgRes.json();
        setOrganization(orgData.organization);
        setActiveOrganizationCookie(orgData.organization._id);

        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setMemberCount(membersData.members?.length || 0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrganization();
  }, [slug]);

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (error || !organization) {
    return (
      <div className="space-y-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <h3 className="font-semibold text-red-600 dark:text-red-400">
            Error
          </h3>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {error || "Organization not found"}
          </p>
          <Link
            href="/organizations"
            className="mt-4 inline-flex items-center gap-1 text-sm text-red-600 hover:underline dark:text-red-400"
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {organization.logoUrl ? (
            <img
              src={organization.logoUrl}
              alt={organization.name}
              className="h-16 w-16 rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <span className="text-2xl font-semibold text-zinc-600 dark:text-zinc-400">
                {organization.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {organization.name}
              </h1>
              {orgTier === "pro" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Pro
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {organization.slug}
            </p>
            {organization.description && (
              <p className="mt-2 max-w-lg text-sm text-zinc-600 dark:text-zinc-400">
                {organization.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              role === "owner"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                : role === "project_manager"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : role === "team_lead"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {ORG_ROLE_LABELS[role]}
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href={`/organizations/${slug}/members`}
          className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
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
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Members
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </p>
          </div>
          <svg
            className="h-5 w-5 text-zinc-400 transition-transform group-hover:translate-x-1"
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

        {isOwner && (
          <Link
            href={`/organizations/${slug}/settings`}
            className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
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
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                Settings
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Configure organization
              </p>
            </div>
            <svg
              className="h-5 w-5 text-zinc-400 transition-transform group-hover:translate-x-1"
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
          className="group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 text-left transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
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
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Projects
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              View all projects
            </p>
          </div>
          <svg
            className="h-5 w-5 text-zinc-400 transition-transform group-hover:translate-x-1"
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
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Organization Details
        </h2>
        <dl className="mt-4 space-y-4">
          <div className="flex justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Created
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-100">
              {new Date(organization.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
          <div className="flex justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">Plan</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-100">
              {orgTier === "pro" ? "Pro Plan" : "Free Plan"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">
              Last Updated
            </dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-100">
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
