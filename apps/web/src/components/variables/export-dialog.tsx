"use client";

import { useId, useState } from "react";
import { DrawerPanel } from "@/components/ui";
import { Download, Loader2 } from "lucide-react";
import {
  ALL_FORMATS,
  FORMAT_LABELS,
  serialize,
  getFileExtension,
  getContentType,
  type FormatType,
} from "@/lib/format-converter";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { sanitizeConvexError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";
import type { Id } from "@convex/_generated/dataModel";

const log = createLogger("variables/export");

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
  const exportValues = useAction(api.features.variables.values.exportValues);
  const { allowed, tierName } = useFeatureGate(organizationId, "bulk_export");
  const uid = useId();
  const formatFieldId = `${uid}-format`;
  const environmentFieldId = `${uid}-environment`;

  const handleExport = async () => {
    setIsExporting(true);
    setNotice(null);
    try {
      // The backend returns decrypted pairs; the file is built here. Both the
      // serializer and the format catalogue already run in the browser, so a
      // route existed only to call the same two functions server-side.
      const { values } = await exportValues({
        projectId: projectId as Id<"projects">,
        environment: environment === "all" ? undefined : environment,
      });

      const vars = Object.fromEntries(values.map((v) => [v.key, v.value]));
      const body = serialize(vars, format, {
        projectName,
        environment: environment === "all" ? undefined : environment,
      });
      const filename = `${projectName}-${environment}.${getFileExtension(format)}`;
      const blob = new Blob([body], { type: getContentType(format) });

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
      log.error(
        "variable_export_failed",
        { projectId, organizationId, environment, format },
        err
      );
      setNotice(`Error: ${sanitizeConvexError(err) || "Export failed"}`);
    }
    // After the try/catch, not in a `finally`: React Compiler bails on the
    // whole component when a try carries a finalizer. The catch swallows, so
    // this clears on both paths.
    setIsExporting(false);
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
              <label
                htmlFor={formatFieldId}
                className="mb-1.5 block text-sm font-medium text-ink-muted"
              >
                Format
              </label>
              <select
                id={formatFieldId}
                value={format}
                onChange={(e) => setFormat(e.target.value as FormatType)}
                className="w-full rounded-lg border px-3 py-2 text-base transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line-strong bg-surface-raised text-ink"
              >
                {ALL_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={environmentFieldId}
                className="mb-1.5 block text-sm font-medium text-ink-muted"
              >
                Environment
              </label>
              <select
                id={environmentFieldId}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-base transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line-strong bg-surface-raised text-ink"
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
