"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAuthContext } from "./auth-provider";
import {
  TerminalButtonLink,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { ROLE_LEVEL, roleLabel, roleLevel, type OrgRole } from "@/lib/roles";

interface RequireRoleProps {
  /** Minimum unified org role required to view the page. */
  minimum: OrgRole;
  children: ReactNode;
}

/**
 * Hook variant of the page guard. Returns the auth loading state and whether
 * the current user's org role meets the minimum. Legacy role strings are
 * normalized via roleLevel().
 */
export function useRequireRole(minimum: OrgRole): {
  isLoading: boolean;
  allowed: boolean;
} {
  const { organization, isLoading } = useAuthContext();
  const allowed =
    !isLoading &&
    !!organization &&
    roleLevel(organization.role) >= ROLE_LEVEL[minimum];
  return { isLoading, allowed };
}

/**
 * Page-level role guard. Wrap a dashboard page's content to block users whose
 * org role is below `minimum` — they get a clean full-page "no access" state
 * instead of a half-broken page. Backend authz still enforces every action;
 * this is purely the page-level UX layer.
 *
 * Usage: <RequireRole minimum="project_manager">…</RequireRole>
 */
export function RequireRole({ minimum, children }: RequireRoleProps) {
  const { isLoading, allowed } = useRequireRole(minimum);

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="rounded-full border border-red-500/20 bg-red-500/10 p-4">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-100">
          You don&apos;t have access to this page
        </h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-400">
          This page requires the {roleLabel(minimum)} role or higher in your
          organization. Ask an owner if you think you need access.
        </p>
        <div className="mt-6">
          <TerminalButtonLink href="/dashboard" variant="primary">
            Back to Dashboard
          </TerminalButtonLink>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
