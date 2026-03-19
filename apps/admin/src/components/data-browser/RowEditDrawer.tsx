import { useState, useEffect } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { useConfirmStore } from "@/stores/confirm-store";
import { Copy, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, timeAgo } from "@/lib/utils";

type ViewMode = "form" | "json";

interface RowEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  row: Record<string, unknown> | null;
  tableName: string;
  onSave: (id: string, fields: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// Fields that should be read-only
const READ_ONLY_FIELDS = ["_id", "_creationTime"];

// Heuristic: check if a number looks like a timestamp
function isTimestamp(key: string, value: unknown): boolean {
  if (typeof value !== "number") return false;
  if (value < 1577836800000 || value > 1893456000000) return false;
  return (
    key.includes("At") ||
    key.includes("Time") ||
    key.includes("Date") ||
    key === "expiresAt"
  );
}

export function RowEditDrawer({
  isOpen,
  onClose,
  row,
  tableName,
  onSave,
  onDelete,
}: RowEditDrawerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("form");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [jsonData, setJsonData] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { confirm } = useConfirmStore();

  // Initialize form data when row changes
  useEffect(() => {
    if (row) {
      setFormData({ ...row });
      setJsonData(JSON.stringify(row, null, 2));
      setError(null);
      setViewMode("form");
    }
  }, [row]);

  // Sync between form and JSON when switching views
  const switchToForm = () => {
    try {
      const parsed = JSON.parse(jsonData);
      setFormData(parsed);
      setError(null);
      setViewMode("form");
    } catch {
      setError("Invalid JSON — fix before switching to form view");
    }
  };

  const switchToJson = () => {
    setJsonData(JSON.stringify(formData, null, 2));
    setError(null);
    setViewMode("json");
  };

  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!row) return;
    setSaving(true);
    setError(null);
    try {
      let fieldsToSave: Record<string, unknown>;
      if (viewMode === "json") {
        fieldsToSave = JSON.parse(jsonData);
      } else {
        fieldsToSave = { ...formData };
      }
      // Remove system fields before saving
      delete fieldsToSave._id;
      delete fieldsToSave._creationTime;
      await onSave(row._id as string, JSON.stringify(fieldsToSave));
      onClose();
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Invalid JSON"
          : err instanceof Error
            ? err.message
            : "Failed to save"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!row) return;
    const ok = await confirm({
      title: "Delete Row",
      message: `This will permanently delete this row from "${tableName}". This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await onDelete(row._id as string);
    onClose();
  };

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const hasChanges = () => {
    if (!row) return false;
    if (viewMode === "json") {
      return jsonData !== JSON.stringify(row, null, 2);
    }
    return JSON.stringify(formData) !== JSON.stringify(row);
  };

  const handleBeforeClose = async () => {
    if (!hasChanges()) return true;
    return await confirm({
      title: "Unsaved Changes",
      message: "You have unsaved changes. Discard them?",
      confirmLabel: "Discard",
      variant: "warning",
    });
  };

  if (!row) return null;

  // Build ordered keys: _id first, then sorted user keys, then _creationTime
  const allKeys = Object.keys(row);
  const userKeys = allKeys.filter((k) => !READ_ONLY_FIELDS.includes(k)).sort();
  const orderedKeys = ["_id", ...userKeys, "_creationTime"];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Row`}
      description={`${tableName} · ${(row._id as string)?.slice(0, 12)}...`}
      width="max-w-xl"
      onBeforeClose={handleBeforeClose}
    >
      {/* View mode toggle */}
      <div className="mb-5 flex rounded-md border border-zinc-700 p-0.5">
        <button
          onClick={() =>
            viewMode === "json" ? switchToForm() : setViewMode("form")
          }
          className={cn(
            "flex-1 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
            viewMode === "form"
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          Form
        </button>
        <button
          onClick={() =>
            viewMode === "form" ? switchToJson() : setViewMode("json")
          }
          className={cn(
            "flex-1 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
            viewMode === "json"
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          Raw JSON
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {viewMode === "form" ? (
        <div className="space-y-4">
          {orderedKeys
            .filter((k) => k in row)
            .map((key) => {
              const value = formData[key];
              const isReadOnly = READ_ONLY_FIELDS.includes(key);

              return (
                <div key={key}>
                  <label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-zinc-400">
                    {key}
                    {isReadOnly && (
                      <span className="text-[10px] text-zinc-600">
                        read-only
                      </span>
                    )}
                  </label>

                  {isReadOnly ? (
                    <ReadOnlyField
                      fieldKey={key}
                      value={value}
                      onCopy={copyToClipboard}
                      copied={copiedField === key}
                    />
                  ) : typeof value === "boolean" ? (
                    <BooleanField
                      value={value}
                      onChange={(v) => handleFieldChange(key, v)}
                    />
                  ) : typeof value === "number" ? (
                    isTimestamp(key, value) ? (
                      <TimestampField
                        value={value}
                        onChange={(v) => handleFieldChange(key, v)}
                      />
                    ) : (
                      <input
                        type="number"
                        value={value}
                        onChange={(e) =>
                          handleFieldChange(key, Number(e.target.value))
                        }
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    )
                  ) : Array.isArray(value) ? (
                    <ArrayField
                      value={value}
                      onChange={(v) => handleFieldChange(key, v)}
                    />
                  ) : typeof value === "object" && value !== null ? (
                    <ObjectField
                      value={value as Record<string, unknown>}
                      onChange={(v) => handleFieldChange(key, v)}
                      fieldKey={key}
                    />
                  ) : value === null || value === undefined ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-600 italic">null</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFieldChange(key, "")}
                      >
                        Set value
                      </Button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={String(value)}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <Textarea
          id="json-editor"
          value={jsonData}
          onChange={(e) => setJsonData(e.target.value)}
          rows={25}
          className="font-mono text-xs"
        />
      )}

      {/* Footer actions */}
      <div className="mt-6 space-y-3">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {/* Danger zone */}
        <div className="border-t border-zinc-800 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete this row
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

// ─── Sub-components ─────────────────────────────────────

function ReadOnlyField({
  fieldKey,
  value,
  onCopy,
  copied,
}: {
  fieldKey: string;
  value: unknown;
  onCopy: (value: string, field: string) => void;
  copied: boolean;
}) {
  const str = String(value ?? "");
  const displayValue =
    fieldKey === "_creationTime" && typeof value === "number"
      ? `${formatDateTime(value)} (${timeAgo(value)})`
      : str;

  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <span className="flex-1 truncate font-mono text-xs text-zinc-500">
        {displayValue}
      </span>
      <button
        onClick={() => onCopy(str, fieldKey)}
        className="flex-shrink-0 text-zinc-500 hover:text-zinc-300"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function BooleanField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-2"
    >
      <div
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          value ? "bg-emerald-600" : "bg-zinc-700"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            value ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </div>
      <Badge variant={value ? "success" : "danger"}>
        {value ? "true" : "false"}
      </Badge>
    </button>
  );
}

function TimestampField({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  // Show as datetime-local input
  const dateStr = new Date(value).toISOString().slice(0, 16);
  return (
    <div className="space-y-1">
      <input
        type="datetime-local"
        value={dateStr}
        onChange={(e) => onChange(new Date(e.target.value).getTime())}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
      <p className="text-xs text-zinc-600">{timeAgo(value)}</p>
    </div>
  );
}

function ArrayField({
  value,
  onChange,
}: {
  value: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const [newItem, setNewItem] = useState("");

  // Simple string array editor
  const allStrings = value.every((v) => typeof v === "string");

  if (!allStrings) {
    // Fall back to JSON editing for non-string arrays
    return (
      <Textarea
        id="array-field"
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // Allow invalid JSON while typing
          }
        }}
        rows={4}
        className="font-mono text-xs"
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(value as string[]).map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300"
          >
            {item}
            <button
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="ml-0.5 text-zinc-500 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newItem.trim()) {
              onChange([...value, newItem.trim()]);
              setNewItem("");
            }
          }}
          placeholder="Add item..."
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (newItem.trim()) {
              onChange([...value, newItem.trim()]);
              setNewItem("");
            }
          }}
          disabled={!newItem.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function ObjectField({
  value,
  onChange,
  fieldKey,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  fieldKey: string;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleChange = (newText: string) => {
    setText(newText);
    try {
      const parsed = JSON.parse(newText);
      onChange(parsed);
      setJsonError(null);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  return (
    <div>
      <Textarea
        id={`field-${fieldKey}`}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        className={cn(
          "font-mono text-xs",
          jsonError && "border-red-500/50 focus:border-red-500"
        )}
      />
      {jsonError && <p className="mt-1 text-xs text-red-400">{jsonError}</p>}
    </div>
  );
}
