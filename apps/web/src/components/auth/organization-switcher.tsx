"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { setActiveOrganizationCookie } from "@/lib/organization-context";
import { roleLabel } from "@/lib/roles";
import { useAuthContext } from "./auth-provider";
import { useConvexUser } from "@/hooks/useConvexUser";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  role: string;
}

function ProBadge() {
  return (
    <span className="flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-warning-soft text-warning">
      Pro
    </span>
  );
}

interface OrganizationSwitcherProps {
  currentOrgId?: string;
  onOrganizationChange?: (orgId: string) => void;
  collapsed?: boolean;
}

function formatRole(role: string): string {
  return roleLabel(role);
}

export function OrganizationSwitcher({
  currentOrgId,
  onOrganizationChange,
  collapsed,
}: OrganizationSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Live org list over the existing Convex WebSocket — replaces the old
  // fetch("/api/organizations") that re-ran on EVERY navigation (each hit
  // cost a getByWorkosId + listForUser round-trip server-side). The
  // subscription is established once, dedupes with the /organizations and
  // usage pages (same query+args), and updates reactively on org changes.
  const { user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);
  const orgDocs = useQuery(
    api.features.organizations.queries.listForUser,
    convexUserId ? {} : "skip"
  );
  const organizations: Organization[] = (orgDocs ?? []).filter(
    (o): o is NonNullable<typeof o> => o !== null
  );
  const isLoading = orgDocs === undefined;

  // One lean tiers query for ALL orgs (Pro badges) — replaces a ~64-doc
  // getResolvedFeatures subscription PER dropdown row.
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
  // One pass straight into the Set. The chain built a filtered array and a
  // mapped array on the way, and `orgTiers` is index-aligned with
  // `organizations`, so the index has to survive either way.
  const proOrgIds = new Set<string>();
  for (const [i, o] of organizations.entries()) {
    if (orgTiers?.[i]?.tierName === "pro") proOrgIds.add(o._id);
  }

  const currentOrg =
    organizations.find((org) => org._id === currentOrgId) || organizations[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelectOrganization(org: Organization) {
    if (org._id === currentOrgId) {
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    setActiveOrganizationCookie(org._id);
    if (onOrganizationChange) {
      onOrganizationChange(org._id);
    }

    // Navigate after a short delay to let the auth state refresh via
    // the org-context-changed event listener in useAuth. Avoids firing
    // a server-side router.refresh() which would cause duplicate Convex
    // queries and potential 502 errors during the transition.
    setTimeout(() => {
      if (pathname.startsWith("/organizations")) {
        router.push(`/organizations/${org.slug}`);
      } else {
        router.push("/dashboard");
      }
    }, 100);
  }

  if (isLoading) {
    return (
      <div
        className={`flex items-center gap-3 ${collapsed ? "justify-center px-0 py-2" : "px-3 py-2"}`}
      >
        <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-hover" />
        {!collapsed && (
          <div className="flex-1">
            <div className="h-4 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="mt-1 h-3 w-16 animate-pulse rounded bg-surface-hover" />
          </div>
        )}
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <Link
        href="/organizations/new"
        title={collapsed ? "Create Organization" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-ink-muted hover:bg-surface-hover ${collapsed ? "justify-center px-0" : ""}`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-line-strong">
          <svg
            className="h-4 w-4 text-ink-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        {!collapsed && (
          <span className="text-sm font-medium">Create Organization</span>
        )}
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={collapsed ? currentOrg?.name : undefined}
        className={`flex w-full items-center rounded-lg py-2 text-left transition-colors hover:bg-surface-hover ${
          collapsed ? "justify-center px-0" : "justify-between gap-3 px-3"
        }`}
      >
        <div
          className={`flex items-center overflow-hidden ${collapsed ? "justify-center" : "gap-3"}`}
        >
          {currentOrg?.logoUrl ? (
            <Image
              src={currentOrg.logoUrl}
              alt={currentOrg.name}
              width={32}
              height={32}
              className="h-8 w-8 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover">
              <span className="text-sm font-semibold text-ink-muted">
                {currentOrg?.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {currentOrg?.name || "Select Organization"}
              </p>
              {currentOrg && (
                <p className="truncate text-xs text-ink-muted">
                  {formatRole(currentOrg.role)}
                </p>
              )}
            </div>
          )}
        </div>
        {!collapsed && (
          <svg
            className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1 rounded-lg border py-1 shadow-lg border-line bg-surface-raised ${
            collapsed ? "left-full top-0 ml-2 w-64" : "left-0 right-0"
          }`}
        >
          <div className="max-h-64 overflow-y-auto">
            {organizations.map((org) => (
              <button
                key={org._id}
                onClick={() => handleSelectOrganization(org)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-hover ${
                  org._id === currentOrg?._id ? "bg-surface-hover/50" : ""
                }`}
              >
                {org.logoUrl ? (
                  <Image
                    src={org.logoUrl}
                    alt={org.name}
                    width={32}
                    height={32}
                    className="h-8 w-8 flex-shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-hover">
                    <span className="text-sm font-semibold text-ink-muted">
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">
                      {org.name}
                    </p>
                    {proOrgIds.has(org._id) && <ProBadge />}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {formatRole(org.role)}
                  </p>
                </div>
                {org._id === currentOrg?._id && (
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-line">
            <Link
              href="/organizations"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors text-ink-muted hover:bg-surface-hover"
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
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Manage Organizations
            </Link>
            <Link
              href="/organizations/new"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors text-ink-muted hover:bg-surface-hover"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Create Organization
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
