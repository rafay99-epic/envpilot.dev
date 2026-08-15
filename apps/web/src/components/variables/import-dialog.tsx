"use client";

import { useId, useState } from "react";
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

type ImportMode = "merge" | "replace";

/** Import API counts. `requested` replaces them when the importer lacks write access and the rows became pending requests. */
type ImportResult = {
  created: number;
  updated: number;
  deleted: number;
  requested?: number;
};

const LABEL_CLASS = "mb-1.5 block text-sm font-medium text-ink-muted";

const SELECT_CLASS =
  "w-full rounded-lg border px-3 py-2 text-base transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line-strong bg-surface-raised text-ink";

export function ImportDialog({
  isOpen,
  onClose,
  projectId,
  organizationId,
  onImported,
}: ImportDrawerProps) {
  const { allowed, tierName } = useFeatureGate(organizationId, "bulk_import");
  const uid = useId();
  const formatFieldId = `${uid}-format`;
  const environmentFieldId = `${uid}-environment`;
  const modeFieldId = `${uid}-mode`;
  const sourceLabelId = `${uid}-source`;
  const contentFieldId = `${uid}-content`;
  const [format, setFormat] = useState<FormatType>("env");
  const [environment, setEnvironment] = useState("development");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [parseError, setParseError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

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
    }
    // Runs on both paths: the catch above swallows, and neither branch returns early.
    setIsImporting(false);
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
          <ImportSummary result={result} onDone={handleClose} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                id={formatFieldId}
                label="Format"
                value={format}
                onChange={handleFormatChange}
              >
                {ALL_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id={environmentFieldId}
                label="Target Environment"
                value={environment}
                onChange={(value) => setEnvironment(value)}
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </SelectField>
            </div>

            <SelectField
              id={modeFieldId}
              label="Mode"
              value={mode}
              onChange={(value) => setMode(value)}
            >
              <option value="merge">Merge (add/update, keep existing)</option>
              <option value="replace">
                Replace (match file exactly, delete extras)
              </option>
            </SelectField>

            <ImportSource
              sourceLabelId={sourceLabelId}
              contentFieldId={contentFieldId}
              fileName={fileName}
              content={content}
              format={format}
              onFileChange={handleFileChange}
              onContentChange={handleContentChange}
            />

            {parseError && (
              <div className="rounded-lg border px-4 py-3 text-sm border-danger-line bg-danger-soft text-danger">
                {parseError}
              </div>
            )}

            {preview && previewKeys.length > 0 && (
              <ImportPreview keys={previewKeys} />
            )}

            <ImportActions
              isImporting={isImporting}
              disabled={
                isImporting || !content.trim() || previewKeys.length === 0
              }
              variableCount={previewKeys.length}
              onCancel={handleClose}
              onImport={handleImport}
            />
          </>
        )}
      </div>
    </DrawerPanel>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        // A select can only report one of the option values rendered above, all of which are T.
        onChange={(e) => onChange(e.target.value as T)}
        className={SELECT_CLASS}
      >
        {children}
      </select>
    </div>
  );
}

function ImportSource({
  sourceLabelId,
  contentFieldId,
  fileName,
  content,
  format,
  onFileChange,
  onContentChange,
}: {
  sourceLabelId: string;
  contentFieldId: string;
  fileName: string;
  content: string;
  format: FormatType;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onContentChange: (text: string) => void;
}) {
  return (
    <div>
      <div id={sourceLabelId} className={LABEL_CLASS}>
        File or Content
      </div>
      <div role="group" aria-labelledby={sourceLabelId} className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line p-3 text-sm transition-colors text-ink-muted hover:border-line-strong">
          <FileUp className="h-4 w-4 shrink-0" />
          <span className="truncate">{fileName || "Choose a file..."}</span>
          <input
            type="file"
            className="hidden"
            onChange={onFileChange}
            accept=".env,.json,.yaml,.yml,.toml"
          />
        </label>
        <label
          htmlFor={contentFieldId}
          className="block cursor-pointer text-center text-xs text-ink-subtle"
        >
          or paste content below
        </label>
        <textarea
          id={contentFieldId}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          className="h-32 w-full rounded-lg border px-3 py-2 font-mono text-base transition-colors focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong sm:text-sm border-line-strong bg-surface-raised text-ink"
          placeholder={`Paste your ${FORMAT_LABELS[format]} content here...`}
        />
      </div>
    </div>
  );
}

function ImportPreview({ keys }: { keys: string[] }) {
  return (
    <div className="rounded-lg border p-3 border-line bg-surface-raised">
      <p className="mb-2 text-sm font-medium text-ink-muted">
        Preview: {keys.length} variable
        {keys.length !== 1 ? "s" : ""} found
      </p>
      <div className="max-h-32 space-y-0.5 overflow-y-auto font-mono text-xs text-ink-muted">
        {keys.toSorted().map((key) => (
          <div key={key} className="truncate">
            {key}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportActions({
  isImporting,
  disabled,
  variableCount,
  onCancel,
  onImport,
}: {
  isImporting: boolean;
  disabled: boolean;
  variableCount: number;
  onCancel: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={onCancel}
        className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors border-line-strong text-ink-muted hover:bg-surface-hover"
      >
        Cancel
      </button>
      <button
        onClick={onImport}
        disabled={disabled}
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
            Import {variableCount > 0 ? `(${variableCount})` : ""}
          </>
        )}
      </button>
    </div>
  );
}

function ImportSummary({
  result,
  onDone,
}: {
  result: ImportResult;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 text-sm border-accent-line bg-accent-soft text-accent">
        {result.requested ? (
          <p>
            Created {result.requested} pending request(s). A Project Manager or
            Team Lead will need to approve them.
          </p>
        ) : (
          <p>
            Import complete: {result.created} created, {result.updated} updated
            {result.deleted > 0 ? `, ${result.deleted} deleted` : ""}.
          </p>
        )}
      </div>
      <button
        onClick={onDone}
        className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors border-line-strong text-ink-muted hover:bg-surface-hover"
      >
        Done
      </button>
    </div>
  );
}
