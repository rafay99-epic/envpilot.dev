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
            <div className="rounded-lg border p-4 text-sm border-accent-line bg-accent-soft text-accent">
              {result.requested ? (
                <p>
                  Created {result.requested} pending request(s). A Project
                  Manager or Team Lead will need to approve them.
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
              className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors border-line-strong text-ink-muted hover:bg-surface-hover"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-muted">
                  Format
                </label>
                <select
                  value={format}
                  onChange={(e) =>
                    handleFormatChange(e.target.value as FormatType)
                  }
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
                  Target Environment
                </label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line-strong bg-surface-raised text-ink"
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">
                Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "merge" | "replace")}
                className="w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line-strong bg-surface-raised text-ink"
              >
                <option value="merge">Merge (add/update, keep existing)</option>
                <option value="replace">
                  Replace (match file exactly, delete extras)
                </option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-muted">
                File or Content
              </label>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line p-3 text-sm transition-colors text-ink-muted hover:border-line-strong">
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
                <div className="text-center text-xs text-ink-subtle">
                  or paste content below
                </div>
                <textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  className="h-32 w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line-strong bg-surface-raised text-ink"
                  placeholder={`Paste your ${FORMAT_LABELS[format]} content here...`}
                />
              </div>
            </div>

            {parseError && (
              <div className="rounded-lg border px-4 py-3 text-sm border-danger-line bg-danger-soft text-danger">
                {parseError}
              </div>
            )}

            {preview && previewKeys.length > 0 && (
              <div className="rounded-lg border p-3 border-line bg-surface-raised">
                <p className="mb-2 text-sm font-medium text-ink-muted">
                  Preview: {previewKeys.length} variable
                  {previewKeys.length !== 1 ? "s" : ""} found
                </p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto font-mono text-xs text-ink-muted">
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
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors border-line-strong text-ink-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={
                  isImporting || !content.trim() || previewKeys.length === 0
                }
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
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
