"use client";

import type { ReactNode } from "react";
import { useAuthContext } from "./auth-provider";

interface RequireActionProps {
  /** Action string from convex/authz.ts (e.g. "org:create_project") */
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface RequireAnyActionProps {
  /** Action strings from convex/authz.ts */
  actions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

interface RequireAllActionsProps {
  /** Action strings from convex/authz.ts */
  actions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditionally render children based on a single action
 */
export function RequirePermission({
  action,
  children,
  fallback = null,
}: RequireActionProps) {
  const { canDo, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!canDo(action)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Conditionally render children if user can perform ANY of the specified actions
 */
export function RequireAnyPermission({
  actions,
  children,
  fallback = null,
}: RequireAnyActionProps) {
  const { canDo, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!actions.some((a) => canDo(a))) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Conditionally render children if user can perform ALL of the specified actions
 */
export function RequireAllPermissions({
  actions,
  children,
  fallback = null,
}: RequireAllActionsProps) {
  const { canDo, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!actions.every((a) => canDo(a))) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
