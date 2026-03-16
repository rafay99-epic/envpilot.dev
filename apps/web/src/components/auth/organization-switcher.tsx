"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setActiveOrganizationCookie } from "@/lib/organization-context";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  tier: "free" | "pro";
  role: "admin" | "team_lead" | "member";
}

interface OrganizationSwitcherProps {
  currentOrgId?: string;
  onOrganizationChange?: (orgId: string) => void;
}

export function OrganizationSwitcher({
  currentOrgId,
  onOrganizationChange,
}: OrganizationSwitcherProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentOrg =
    organizations.find((org) => org._id === currentOrgId) || organizations[0];

  useEffect(() => {
    let cancelled = false;

    async function fetchOrganizations() {
      try {
        const response = await fetch("/api/organizations");
        if (response.ok && !cancelled) {
          const data = await response.json();
          setOrganizations(data.organizations || []);
        }
      } catch {
        // Silently fail - organizations will be empty
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchOrganizations();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
    setIsOpen(false);
    setActiveOrganizationCookie(org._id);
    if (onOrganizationChange) {
      onOrganizationChange(org._id);
    }

    if (pathname.startsWith("/organizations")) {
      router.push(`/organizations/${org.slug}`);
    } else {
      router.push("/dashboard");
    }
    router.refresh();
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
        <div className="flex-1">
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="mt-1 h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <Link
        href="/organizations/new"
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600">
          <svg
            className="h-4 w-4 text-zinc-400"
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
        <span className="text-sm font-medium">Create Organization</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {currentOrg?.logoUrl ? (
            <img
              src={currentOrg.logoUrl}
              alt={currentOrg.name}
              className="h-8 w-8 flex-shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
              <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                {currentOrg?.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {currentOrg?.name || "Select Organization"}
            </p>
            {currentOrg && (
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {currentOrg.role === "team_lead"
                  ? "Team Lead"
                  : currentOrg.role.charAt(0).toUpperCase() +
                    currentOrg.role.slice(1)}
              </p>
            )}
          </div>
        </div>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
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
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <div className="max-h-64 overflow-y-auto">
            {organizations.map((org) => (
              <button
                key={org._id}
                onClick={() => handleSelectOrganization(org)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                  org._id === currentOrg?._id
                    ? "bg-zinc-50 dark:bg-zinc-700/50"
                    : ""
                }`}
              >
                {org.logoUrl ? (
                  <img
                    src={org.logoUrl}
                    alt={org.name}
                    className="h-8 w-8 flex-shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-600">
                    <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {org.name}
                    </p>
                    {org.tier === "pro" && (
                      <span className="flex-shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Pro
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {org.role === "team_lead"
                      ? "Team Lead"
                      : org.role.charAt(0).toUpperCase() + org.role.slice(1)}
                  </p>
                </div>
                {org._id === currentOrg?._id && (
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-green-500"
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

          <div className="border-t border-zinc-200 dark:border-zinc-700">
            <Link
              href="/organizations"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
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
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
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
