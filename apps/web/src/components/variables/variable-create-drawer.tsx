"use client";

import { useState } from "react";
import { DrawerPanel } from "@/components/ui";
import { VariableForm, type VariableFormData } from "./variable-form";
import { BulkPasteForm } from "./bulk-paste-form";
import { useTierLimitCheck } from "@/hooks/useTierLimits";
import { ProOnlyBadge, LimitWarning } from "@/components/tier/FeatureGate";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import { useEnforcementEnabled } from "@/hooks/useTierLimits";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import type { Id } from "@convex/_generated/dataModel";

interface VariableCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: VariableFormData) => Promise<void>;
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

  const orgId = organizationId as Id<"organizations"> | undefined;
  const projId = projectId as Id<"projects"> | undefined;
  const enforcing = useEnforcementEnabled();

  const varCheck = useTierLimitCheck(orgId, "create_variable", projId);
  const bulkCheck = useTierLimitCheck(orgId, "bulk_import");
  const { allowed: showRotation } = useFeatureGate(orgId, "secret_rotation");

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
    const failures: Array<{ key: string; error: string }> = [];

    for (const entry of entries) {
      try {
        await onCreate(entry);
      } catch (err) {
        failures.push({
          key: entry.key,
          error: err instanceof Error ? err.message : "Failed to create",
        });
      }
    }

    if (failures.length > 0 && failures.length < entries.length) {
      handleClose();
    } else if (failures.length === 0) {
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
      {/* Variable limit warning */}
      {enforcing &&
        varCheck.current !== undefined &&
        varCheck.limit !== undefined && (
          <div className="mb-4">
            <LimitWarning
              current={varCheck.current}
              limit={varCheck.limit}
              resourceName="variables"
            />
          </div>
        )}

      {/* Tab switcher */}
      <div className="mb-4 flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab("single")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "single"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bulk")}
          className={`flex-1 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors inline-flex justify-center ${
            activeTab === "bulk"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
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
            showRotation={showRotation}
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
        />
      )}
    </DrawerPanel>
  );
}
