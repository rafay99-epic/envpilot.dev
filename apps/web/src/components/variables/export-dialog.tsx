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
            <p className="text-sm text-ink-muted">
              Export environment variables from{" "}
              <span className="font-medium text-ink">{projectName}</span> in
              your preferred format.
            </p>

            {notice && (
              <div
                className={`rounded-lg px-4 py-3 text-sm ${
                  notice.startsWith("Error")
                    ? "border border-danger-line bg-danger-soft text-danger"
                    : "border border-accent-line bg-accent-soft text-accent"
                }`}
              >
                {notice}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as FormatType)}
                className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line-strong bg-surface-raised text-ink"
              >
                {ALL_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">
                Environment
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line-strong bg-surface-raised text-ink"
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
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors border-line-strong text-ink-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
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
