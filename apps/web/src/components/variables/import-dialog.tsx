"use client";

import { useState } from "react";
import { DrawerPanel } from "@/components/ui";
import { Upload, Loader2, FileUp } from "lucide-react";
import {
  parse,
  detectFormatFromExtension,
  ALL_FORMATS,
  FORMAT_LABELS,
  type FormatType,
} from "@/lib/format-converter";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { UpgradePrompt } from "@/components/tier/UpgradePrompt";
import type { Id } from "@convex/_generated/dataModel";

interface ImportDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
  organizationId?: Id<"organizations">;
  onImported?: () => void;
}

export function ImportDialog({
  isOpen,
  onClose,
  projectId,
  organizationId,
  onImported,
}: ImportDrawerProps) {
  const { allowed, tierName } = useFeatureGate(organizationId, "bulk_import");
  const [format, setFormat] = useState<FormatType>("env");
  const [environment, setEnvironment] = useState("development");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [parseError, setParseError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    deleted: number;
    requested?: number;
  } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const detected = detectFormatFromExtension(file.name);
    if (detected) {
      setFormat(detected);
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      tryParse(text, detected || format);
    };
    reader.readAsText(file);
  };

  const tryParse = (text: string, fmt: FormatType) => {
    setParseError("");
    setPreview(null);
    if (!text.trim()) return;
    try {
      const parsed = parse(text, fmt);
      setPreview(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse");
    }
  };

  const handleFormatChange = (newFormat: FormatType) => {
    setFormat(newFormat);
    if (content) {
      tryParse(content, newFormat);
    }
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    tryParse(text, format);
  };

  const handleImport = async () => {
    if (!content.trim()) return;
    setIsImporting(true);
    setResult(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, format, environment, mode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      if (data.requested) {
        setResult({
          created: 0,
          updated: 0,
          deleted: 0,
          requested: data.data.requested,
        });
      } else {
        setResult({
          created: data.data.created,
          updated: data.data.updated,
          deleted: data.data.deleted,
        });
      }

      onImported?.();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setContent("");
    setFileName("");
    setPreview(null);
    setParseError("");
    setResult(null);
    onClose();
  };

  const previewKeys = preview ? Object.keys(preview) : [];

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Variables"
      width="xl"
    >
      <div className="space-y-5">
        {!allowed ? (
          <UpgradePrompt
            reason="Bulk import is available on higher-tier plans. Upgrade to import variables from multiple formats."
            feature="Bulk Import"
            currentTier={tierName || "free"}
            variant="banner"
          />
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400">
              {result.requested ? (
                <p>
                  Created {result.requested} pending request(s). An Admin or
                  Team Lead will need to approve them.
                </p>
              ) : (
                <p>
                  Import complete: {result.created} created, {result.updated}{" "}
                  updated
                  {result.deleted > 0 ? `, ${result.deleted} deleted` : ""}.
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) =>
                    handleFormatChange(e.target.value as FormatType)
                  }
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
                  Target Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "merge" | "replace")}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="merge">Merge (add/update, keep existing)</option>
                <option value="replace">
                  Replace (match file exactly, delete extras)
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                File or Content
              </label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 transition-colors hover:border-zinc-400 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500">
                  <FileUp className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {fileName || "Choose a file..."}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".env,.json,.yaml,.yml,.toml"
                  />
                </label>
                <div className="text-center text-xs text-zinc-400 dark:text-zinc-500">
                  or paste content below
                </div>
                <textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className="h-32 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  placeholder={`Paste your ${FORMAT_LABELS[format]} content here...`}
                />
              </div>
            </div>

            {parseError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
                {parseError}
              </div>
            )}

            {preview && previewKeys.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Preview: {previewKeys.length} variable
                  {previewKeys.length !== 1 ? "s" : ""} found
                </p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {previewKeys.sort().map((key) => (
                    <div key={key} className="truncate">
                      {key}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={
                  isImporting || !content.trim() || previewKeys.length === 0
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Import{" "}
                    {previewKeys.length > 0 ? `(${previewKeys.length})` : ""}
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
