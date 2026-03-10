"use client";

import { useState } from "react";
import { DrawerPanel } from "@/components/ui";
import { VariableForm, type VariableFormData } from "./variable-form";
import { BulkPasteForm } from "./bulk-paste-form";

interface VariableCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: VariableFormData) => Promise<void>;
  title?: string;
  submitLabel?: string;
}

type TabMode = "single" | "bulk";

export function VariableCreateDrawer({
  isOpen,
  onClose,
  onCreate,
  title = "Add Variables",
  submitLabel = "Create Variable",
}: VariableCreateDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabMode>("single");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

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
      // Some succeeded, some failed — close but the parent will refresh
      handleClose();
    } else if (failures.length === 0) {
      handleClose();
    }
    // If all failed, stay open so the user can see the errors
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
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "bulk"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Bulk Paste
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "single" ? (
        <VariableForm
          onSubmit={handleSingleSubmit}
          onCancel={handleClose}
          submitLabel={submitLabel}
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
