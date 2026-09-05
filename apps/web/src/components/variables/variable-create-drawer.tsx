"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DrawerPanel } from "@/components/ui";
import { VariableForm, type VariableFormData } from "./variable-form";
import { BulkPasteForm } from "./bulk-paste-form";
import { useTierLimitCheck } from "@/hooks/useTierLimits";
import { ProOnlyBadge, LimitWarning } from "@/components/tier/FeatureGate";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import { useEnforcementEnabled } from "@/hooks/useTierLimits";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import type { Id } from "@convex/_generated/dataModel";
import { useOrganizationTags, useCreateTag, useProtection } from "@/hooks";

interface VariableCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * `silent` suppresses the caller's own per-variable toast. A bulk paste
   * calls this once per entry, so without it 16 failures meant 16 toasts on
   * top of the one summary. The caller still logs and still throws.
   */
  onCreate: (
    data: VariableFormData,
    options?: { silent?: boolean }
  ) => Promise<{ requested: boolean } | void>;
  organizationId?: string;
  projectId?: string;
  title?: string;
  submitLabel?: string;
}

type TabMode = "single" | "bulk";

export function VariableCreateDrawer({
  isOpen,
  onClose,
  onCreate,
  organizationId,
  projectId,
  title = "Add Variables",
  submitLabel = "Create Variable",
}: VariableCreateDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabMode>("single");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Subscribe to the gate/limit queries ONLY while the drawer is open. The
  // drawer stays mounted (closed) on the project page, and checkTierLimit
  // live-counts the project's variables — an always-on subscription re-ran
  // that count on every variable write even with the drawer shut.
  const orgId = isOpen
    ? (organizationId as Id<"organizations"> | undefined)
    : undefined;
  const projId = projectId as Id<"projects"> | undefined;
  const enforcing = useEnforcementEnabled();

  const varCheck = useTierLimitCheck(orgId, "create_variable", projId);
  const bulkCheck = useTierLimitCheck(orgId, "bulk_import");
  const { allowed: showRotation } = useFeatureGate(orgId, "secret_rotation");
  const { allowed: showTags } = useFeatureGate(orgId, "variable_tags");
  // Same open-only gating as the tier checks above: no idle subscription.
  const protection = useProtection(isOpen ? projId : undefined);
  const { tags } = useOrganizationTags(showTags ? organizationId : undefined);
  const createTag = useCreateTag();

  // The legacy request schema (the non-developer branch of useCreateVariable)
  // has no rotation/tags fields, so a value picked here would be silently
  // dropped when filed — hide both controls instead.
  const requestOnly = submitLabel.includes("Request");
  const availableTags = showTags && !requestOnly ? tags : [];

  const handleCreateTag = async (name: string, color: string) => {
    if (!organizationId) return;
    await createTag.mutateAsync({
      organizationId,
      name,
      color,
    });
  };

  const bulkBlocked = enforcing && !bulkCheck.isLoading && !bulkCheck.allowed;
  const varBlocked = enforcing && !varCheck.isLoading && !varCheck.allowed;

  function handleClose() {
    if (isBulkSubmitting) return;
    setActiveTab("single");
    onClose();
  }

  async function handleSingleSubmit(data: VariableFormData) {
    await onCreate(data);
    handleClose();
  }

  async function handleBulkSubmit(entries: VariableFormData[]) {
    const { failures, requested } = await createSequentially(entries, onCreate);
    if (reportBulkResult(entries.length, requested, failures)) {
      handleClose();
    }
  }

  const bulkSubmitLabel = submitLabel.includes("Request")
    ? "Request All"
    : "Create All";

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      preventClose={isBulkSubmitting}
    >
      {enforcing && (
        <VariableLimitWarning
          current={varCheck.current}
          limit={varCheck.limit}
        />
      )}

      {/* Tab switcher */}
      <div className="mb-4 flex gap-1 rounded-lg p-1 bg-surface-raised">
        <button
          type="button"
          onClick={() => setActiveTab("single")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "single"
              ? "shadow-sm bg-surface-hover text-ink"
              : "text-ink-faint hover:text-ink"
          }`}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bulk")}
          className={`flex-1 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors inline-flex justify-center ${
            activeTab === "bulk"
              ? "shadow-sm bg-surface-hover text-ink"
              : "text-ink-faint hover:text-ink"
          }`}
        >
          Bulk Paste
          {bulkBlocked && <ProOnlyBadge size="sm" />}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "single" ? (
        varBlocked ? (
          <UpgradePrompt
            reason={varCheck.reason || "You have reached the variable limit."}
            feature="Unlimited Variables"
            currentTier="free"
            variant="inline"
          />
        ) : (
          <VariableForm
            onSubmit={handleSingleSubmit}
            onCancel={handleClose}
            submitLabel={submitLabel}
            showRotation={showRotation && !requestOnly}
            availableTags={availableTags}
            onCreateTag={requestOnly ? undefined : handleCreateTag}
            protectedEnvironments={protection?.environments}
            allowedEnvironments={protection?.allowedEnvironments}
          />
        )
      ) : bulkBlocked ? (
        <UpgradePrompt
          reason="Bulk import is a Pro feature. Upgrade to import variables from .env files."
          feature="Bulk Import"
          currentTier="free"
          variant="inline"
        />
      ) : (
        <BulkPasteForm
          onSubmit={handleBulkSubmit}
          onCancel={handleClose}
          submitLabel={bulkSubmitLabel}
          onSubmittingChange={setIsBulkSubmitting}
          availableTags={availableTags}
          onCreateTag={requestOnly ? undefined : handleCreateTag}
          protectedEnvironments={protection?.environments}
          allowedEnvironments={protection?.allowedEnvironments}
        />
      )}
    </DrawerPanel>
  );
}

/**
 * Creates the pasted entries one at a time.
 *
 * Sequential on purpose. Firing these concurrently is what the rule suggests
 * and is exactly wrong here: each create writes to the vault and spends from
 * the per-variable rate bucket, so a parallel fan-out of a pasted 48-key
 * block is the throttle this whole change exists to remove. The pooled
 * server paths serialize their first write for the same reason (vault key
 * derivation races on a cold project).
 */
async function createSequentially(
  entries: readonly VariableFormData[],
  onCreate: VariableCreateDrawerProps["onCreate"]
): Promise<{
  failures: Array<{ key: string; error: string }>;
  requested: number;
}> {
  const failures: Array<{ key: string; error: string }> = [];
  // A protected environment turns some entries into requests rather than
  // direct writes, so the summary can't call every success "created".
  let requested = 0;

  for (const entry of entries) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const result = await onCreate(entry, { silent: true });
      if (result?.requested) requested++;
    } catch (err) {
      failures.push({
        key: entry.key,
        error: err instanceof Error ? err.message : "Failed to create",
      });
    }
  }

  return { failures, requested };
}

/** The free-tier variable counter, shown only while enforcement is on. */
function VariableLimitWarning({
  current,
  limit,
}: {
  current?: number;
  limit?: number | null;
}) {
  if (current === undefined || limit === undefined) return null;
  return (
    <div className="mb-4">
      <LimitWarning current={current} limit={limit} resourceName="variables" />
    </div>
  );
}

/**
 * One toast for a finished bulk paste. Returns whether the drawer should
 * close: it stays open only when nothing landed, so the paste can be fixed
 * without retyping it.
 */
function reportBulkResult(
  total: number,
  requested: number,
  failures: ReadonlyArray<{ key: string; error: string }>
): boolean {
  const succeeded = total - failures.length;
  const created = succeeded - requested;
  const landed = [
    created > 0
      ? `${created} variable${created === 1 ? "" : "s"} created`
      : null,
    requested > 0 ? `${requested} sent for approval` : null,
  ]
    .filter(Boolean)
    .join(", ");

  if (failures.length === 0) {
    toast.success(landed);
    return true;
  }

  toast.error(
    succeeded > 0
      ? `${landed}, ${failures.length} skipped`
      : `No variables created (${failures.length} failed)`,
    { description: summarizeFailures(failures).join(" · "), duration: 8000 }
  );
  return succeeded > 0;
}

/**
 * Failures in user terms, one line per distinct cause.
 *
 * Duplicate keys are the common, user-correctable case and get their own
 * line. The rest are grouped BY MESSAGE: pasting 48 variables and hitting
 * one server condition used to print that condition 48 times joined with
 * " · ", which is how a single throttle became an unreadable wall.
 */
function summarizeFailures(
  failures: ReadonlyArray<{ key: string; error: string }>
): string[] {
  const isDuplicate = /already exists/i;
  const duplicateKeys: string[] = [];
  const byMessage = new Map<string, string[]>();
  for (const failure of failures) {
    if (isDuplicate.test(failure.error)) {
      duplicateKeys.push(failure.key);
      continue;
    }
    const keys = byMessage.get(failure.error);
    if (keys) keys.push(failure.key);
    else byMessage.set(failure.error, [failure.key]);
  }

  const parts: string[] = [];
  if (duplicateKeys.length > 0) {
    parts.push(
      `Already exist in the selected environment(s): ${summarizeKeys(duplicateKeys)} — the same key is allowed in a different environment`
    );
  }
  for (const [message, keys] of byMessage) {
    parts.push(
      keys.length === 1
        ? `${keys[0]}: ${message}`
        : `${message} (${keys.length} variables: ${summarizeKeys(keys)})`
    );
  }
  return parts;
}

/**
 * Keys as a readable list. A bulk paste can fail on dozens at once, and a
 * toast that prints every one of them is the wall this replaces.
 */
function summarizeKeys(keys: readonly string[]): string {
  const shown = keys.slice(0, 5).join(", ");
  return keys.length > 5 ? `${shown}, +${keys.length - 5} more` : shown;
}
