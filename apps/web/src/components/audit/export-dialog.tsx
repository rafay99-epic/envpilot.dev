"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";

const DATE_PRESETS = [
  { label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
  { label: "All time", ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

type ExportFormat = "csv" | "json";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (params: {
    startTime: number;
    endTime: number;
    format: ExportFormat;
  }) => void;
  isExporting?: boolean;
}

export function AuditExportDialog({
  isOpen,
  onClose,
  onExport,
  isExporting = false,
}: ExportDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState(2); // Default: 30 days
  const [format, setFormat] = useState<ExportFormat>("csv");

  const handleExport = () => {
    const now = Date.now();
    const preset = DATE_PRESETS[selectedPreset];
    onExport({
      startTime: now - preset.ms,
      endTime: now,
      format,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Audit Logs" size="md">
      <div className="space-y-5">
        {/* Date Range */}
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Date Range
          </label>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                onClick={() => setSelectedPreset(i)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedPreset === i
                    ? "bg-green-500/10 text-green-400 border border-green-500/30"
                    : "border border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            Format
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setFormat("csv")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                format === "csv"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              CSV
              <span className="mt-0.5 block text-xs opacity-60">
                Spreadsheet-compatible
              </span>
            </button>
            <button
              onClick={() => setFormat("json")}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                format === "json"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              JSON
              <span className="mt-0.5 block text-xs opacity-60">
                Full details included
              </span>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
