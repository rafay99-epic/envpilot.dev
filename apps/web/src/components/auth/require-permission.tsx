"use client";

import type { ReactNode } from "react";
import { useAuthContext } from "./auth-provider";
import type { Permission } from "@/lib/auth";

interface RequirePermissionProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

interface RequireAnyPermissionProps {
  permissions: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

interface RequireAllPermissionsProps {
  permissions: Permission[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditionally render children based on a single permission
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: RequirePermissionProps) {
  const { hasPermission, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Conditionally render children if user has ANY of the specified permissions
 */
export function RequireAnyPermission({
  permissions,
  children,
  fallback = null,
}: RequireAnyPermissionProps) {
  const { hasAnyPermission, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!hasAnyPermission(permissions)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Conditionally render children if user has ALL of the specified permissions
 */
export function RequireAllPermissions({
  permissions,
  children,
  fallback = null,
}: RequireAllPermissionsProps) {
  const { hasAllPermissions, isLoading } = useAuthContext();

  if (isLoading) {
    return null;
  }

  if (!hasAllPermissions(permissions)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
