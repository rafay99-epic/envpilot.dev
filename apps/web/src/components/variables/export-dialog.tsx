"use client";

import { useState } from "react";
import { DrawerPanel } from "@/components/ui";
import { Download, Loader2 } from "lucide-react";
import {
  ALL_FORMATS,
  FORMAT_LABELS,
  type FormatType,
} from "@/lib/format-converter";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import type { Id } from "@convex/_generated/dataModel";

interface ExportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  projectName: string;
  organizationId?: Id<"organizations">;
}

export function ExportDialog({
  isOpen,
  onClose,
  projectId,
  projectName,
  organizationId,
}: ExportDrawerProps) {
  const [format, setFormat] = useState<FormatType>("env");
  const [environment, setEnvironment] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { allowed, tierName } = useFeatureGate(organizationId, "bulk_export");

  const handleExport = async () => {
    setIsExporting(true);
    setNotice(null);
    try {
      const params = new URLSearchParams({ format });
      if (environment !== "all") {
        params.set("environment", environment);
      }

      const response = await fetch(
        `/api/projects/${projectId}/export?${params.toString()}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Export failed");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] || `${projectName}-${environment}.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setNotice(`Exported as ${FORMAT_LABELS[format]}`);
    } catch (err) {
      setNotice(
        `Error: ${err instanceof Error ? err.message : "Export failed"}`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setNotice(null);
    onClose();
  };

  return (
    <DrawerPanel isOpen={isOpen} onClose={handleClose} title="Export Variables">
      <div className="space-y-5">
        {!allowed ? (
          <UpgradePrompt
            reason="Bulk export is available on higher-tier plans. Upgrade to export your variables in multiple formats."
            feature="Bulk Export"
            currentTier={tierName || "free"}
            variant="banner"
          />
        ) : (
          <>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Export environment variables from{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-200">
                {projectName}
              </span>{" "}
              in your preferred format.
            </p>

            {notice && (
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  notice.startsWith("Error")
                    ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
                    : "border border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400"
                }`}
              >
                {notice}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as FormatType)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {ALL_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Environment
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="all">All Environments</option>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </DrawerPanel>
  );
}
