"use client";

import { useState } from "react";
import { useAuditLogsForExport, useAuditMutations } from "@/hooks/useAuditLogs";
import { Id } from "../../../convex/_generated/dataModel";
import { Modal } from "@/components/ui/modal";

interface AuditExportProps {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
}

const DEFAULT_END_DATE = new Date().toISOString().split("T")[0];
const DEFAULT_START_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

export function AuditExport({ organizationId, userId }: AuditExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [dateRange, setDateRange] = useState({
    start: DEFAULT_START_DATE,
    end: DEFAULT_END_DATE,
  });
  const [includeDetails, setIncludeDetails] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const startTime = new Date(dateRange.start).getTime();
  const endTime = new Date(dateRange.end).setHours(23, 59, 59, 999);

  const exportData = useAuditLogsForExport(
    isExporting ? organizationId : undefined,
    startTime,
    endTime,
    format,
    includeDetails,
  );

  const { logAuditExport } = useAuditMutations();

  const handleExport = async () => {
    setIsExporting(true);
  };

  const downloadFile = async () => {
    if (!exportData?.data) return;

    // Log the export action
    await logAuditExport({
      organizationId,
      userId,
      exportFormat: format,
      recordCount: exportData.recordCount,
      dateRange: { start: startTime, end: endTime },
    });

    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === "json") {
      content = JSON.stringify(exportData.data, null, 2);
      mimeType = "application/json";
      filename = `audit-logs-${dateRange.start}-to-${dateRange.end}.json`;
    } else {
      // Convert to CSV
      if (exportData.data.length === 0) {
        content = "";
      } else {
        const headers = Object.keys(exportData.data[0]);
        const csvRows = [
          headers.join(","),
          ...exportData.data.map((row: Record<string, unknown>) =>
            headers
              .map((header) => {
                const value = row[header];
                if (value === null || value === undefined) return "";
                if (typeof value === "object")
                  return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                if (
                  typeof value === "string" &&
                  (value.includes(",") ||
                    value.includes('"') ||
                    value.includes("\n"))
                ) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return String(value);
              })
              .join(","),
          ),
        ];
        content = csvRows.join("\n");
      }
      mimeType = "text/csv";
      filename = `audit-logs-${dateRange.start}-to-${dateRange.end}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIsExporting(false);
    setIsOpen(false);
  };

  if (isExporting && exportData?.data) {
    void downloadFile();
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Export
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Export Audit Logs"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Export your audit logs for compliance reporting or external
            analysis.
          </p>

          {/* Date Range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, start: e.target.value }))
                }
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                End Date
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange((prev) => ({ ...prev, end: e.target.value }))
                }
                className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Export Format
            </label>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                  className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  CSV
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="format"
                  value="json"
                  checked={format === "json"}
                  onChange={() => setFormat("json")}
                  className="h-4 w-4 border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  JSON
                </span>
              </label>
            </div>
          </div>

          {/* Include Details */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeDetails}
                onChange={(e) => setIncludeDetails(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                Include detailed event data
              </span>
            </label>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Includes additional context like variable keys, permission levels,
              and change reasons.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isExporting ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
