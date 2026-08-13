"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuthContext } from "@/components/auth";
import type { Id } from "@convex/_generated/dataModel";

/**
 * "Who changed this last" for a settings section, read from the audit trail
 * the settings mutations already write.
 *
 * Gated on the audit capability: `assertAuditAccess` THROWS for anyone without
 * it, so a developer opening settings would otherwise hit a query error on a
 * page that has nothing to do with audit.
 */
export function useSettingsProvenance({
  organizationId,
  action,
  projectId,
}: {
  organizationId: string | undefined;
  action: string;
  projectId?: string;
}): { userName: string; changedAt: number } | null {
  const { capabilities } = useAuthContext();
  const canViewAudit = capabilities?.["org.audit.view"] === true;

  return (
    useQuery(
      api.features.audit.queries.lastChange,
      canViewAudit && organizationId
        ? {
            organizationId: organizationId as Id<"organizations">,
            action,
            ...(projectId ? { projectId: projectId as Id<"projects"> } : {}),
          }
        : "skip"
    ) ?? null
  );
}
