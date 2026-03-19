import { createFileRoute } from "@tanstack/react-router";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  useChangelogStore,
  TYPE_OPTIONS,
  TYPE_CONFIG,
  type ChangelogType,
  type FilterType,
} from "@/stores/changelog-store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Plus,
  Pencil,
  Trash2,
  FileText,
  ArrowLeft,
  Eye,
  Code,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Link,
  Quote,
  Minus,
  ChevronRight,
  Globe,
  GlobeLock,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useCallback } from "react";

export const Route = createFileRoute("/_authenticated/changelog")({
  component: ChangelogPage,
});

// ==========================================
// Badge helpers
// ==========================================

function typeBadgeVariant(type: string) {
  switch (type) {
    case "feature":
      return "success" as const;
    case "improvement":
      return "info" as const;
    case "fix":
      return "warning" as const;
    case "security":
      return "purple" as const;
    case "breaking":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

// ==========================================
// Main Page
// ==========================================

function ChangelogPage() {
  const viewMode = useChangelogStore((s) => s.viewMode);

  return viewMode === "editor" ? <EditorView /> : <ListView />;
}

// ==========================================
// List View
// ==========================================

function ListView() {
  const entries = useAdminQuery(api.admin.listAllChangelog, {});
  const deleteEntry = useAdminMutation(api.admin.deleteChangelog);
  const togglePublish = useAdminMutation(api.admin.toggleChangelogPublish);

  const filterType = useChangelogStore((s) => s.filterType);
  const openCreate = useChangelogStore((s) => s.openCreate);
  const openEdit = useChangelogStore((s) => s.openEdit);
  const setFilterType = useChangelogStore((s) => s.setFilterType);

  const filteredEntries =
    entries && filterType !== "all"
      ? entries.filter((e) => e.type === filterType)
      : entries;

  const publishedCount = entries?.filter((e) => e.isPublished).length ?? 0;
  const draftCount = entries?.filter((e) => !e.isPublished).length ?? 0;

  const handleTogglePublish = async (entryId: Id<"changelog">) => {
    await togglePublish({ id: entryId });
  };

  const { confirm } = useConfirmStore();

  const handleDelete = async (entryId: Id<"changelog">) => {
    const ok = await confirm({
      title: "Delete Changelog Entry",
      message: "This entry will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteEntry({ id: entryId });
  };

  const handleEdit = (entry: NonNullable<typeof entries>[number]) => {
    openEdit(entry._id, {
      title: entry.title ?? "",
      content: entry.content ?? "",
      version: entry.version ?? "",
      type: (entry.type as ChangelogType) ?? "feature",
      isPublished: entry.isPublished ?? false,
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Changelog</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {entries
              ? `${publishedCount} published, ${draftCount} drafts`
              : "Loading..."}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Entry
        </Button>
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", ...TYPE_OPTIONS.map((t) => t.value)] as FilterType[]).map(
          (type) => {
            const isActive = filterType === type;
            const config = type !== "all" ? TYPE_CONFIG[type] : null;
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-all",
                  isActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                )}
              >
                {config && (
                  <span className={cn("mr-1", config.color)}>
                    {config.prefix}
                  </span>
                )}
                {type === "all" ? "All" : config?.label}
                {type !== "all" && entries && (
                  <span className="ml-1.5 text-zinc-600">
                    {entries.filter((e) => e.type === type).length}
                  </span>
                )}
              </button>
            );
          }
        )}
      </div>

      {/* Entries */}
      {!entries ? (
        <Spinner />
      ) : !filteredEntries || filteredEntries.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No changelog entries"
          description={
            filterType !== "all"
              ? `No ${TYPE_CONFIG[filterType].label.toLowerCase()} entries found.`
              : "Create your first changelog entry to get started."
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const config = TYPE_CONFIG[entry.type as ChangelogType];
            return (
              <Card
                key={entry._id}
                className="group flex items-start gap-4 transition-colors hover:border-zinc-700"
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div
                    className={cn(
                      "h-3 w-3 rounded-full",
                      config?.bgColor ?? "bg-zinc-700",
                      config?.borderColor
                        ? `border ${config.borderColor}`
                        : "border border-zinc-600"
                    )}
                  />
                  <div className="mt-2 h-full w-px bg-zinc-800" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {formatDate(entry.publishedAt ?? entry._creationTime)}
                    </span>
                    <span className="text-zinc-700">&middot;</span>
                    {entry.version && (
                      <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        {entry.version}
                      </span>
                    )}
                    <Badge variant={typeBadgeVariant(entry.type)}>
                      {config ? `${config.prefix} ${config.label}` : entry.type}
                    </Badge>
                    {entry.isPublished ? (
                      <Badge variant="success">
                        <Globe className="mr-1 h-2.5 w-2.5" />
                        Published
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <GlobeLock className="mr-1 h-2.5 w-2.5" />
                        Draft
                      </Badge>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="mt-2 flex items-center gap-1.5 font-medium text-zinc-100">
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    {entry.title}
                  </h3>

                  {/* Content preview */}
                  <p className="mt-1.5 line-clamp-2 text-sm text-zinc-500">
                    {entry.content.replace(/[#*`\[\]]/g, "").slice(0, 200)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePublish(entry._id)}
                    title={entry.isPublished ? "Unpublish" : "Publish"}
                  >
                    {entry.isPublished ? (
                      <GlobeLock className="h-3.5 w-3.5" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(entry)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(entry._id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Editor View — Full-Screen
// ==========================================

function EditorView() {
  const createEntry = useAdminMutation(api.admin.createChangelog);
  const updateEntry = useAdminMutation(api.admin.updateChangelog);

  const {
    editingId,
    form,
    editorTab,
    isSaving,
    hasUnsavedChanges,
    closeEditor,
    updateField,
    setEditorTab,
    setSaving,
    markSaved,
  } = useChangelogStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = async () => {
    if (!form.title.trim() || !form.version.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateEntry({
          id: editingId,
          title: form.title,
          content: form.content,
          version: form.version,
          type: form.type,
        });
      } else {
        await createEntry({
          title: form.title,
          content: form.content,
          version: form.version,
          type: form.type,
          isPublished: form.isPublished,
        });
      }
      markSaved();
      closeEditor();
    } catch {
      setSaving(false);
    }
  };

  const { confirm: confirmDialog } = useConfirmStore();

  const handleClose = async () => {
    if (hasUnsavedChanges) {
      const ok = await confirmDialog({
        title: "Discard Changes",
        message:
          "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        variant: "warning",
      });
      if (!ok) return;
    }
    closeEditor();
  };

  // Insert markdown at cursor position in textarea
  const insertAtCursor = useCallback(
    (before: string, after = "") => {
      const ta = textareaRef.current;
      if (!ta) {
        updateField("content", form.content + before + after);
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = form.content.slice(start, end);
      const newContent =
        form.content.slice(0, start) +
        before +
        selected +
        after +
        form.content.slice(end);
      updateField("content", newContent);
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        ta.focus();
        const cursorPos = start + before.length + selected.length;
        ta.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [form.content, updateField]
  );

  const config = TYPE_CONFIG[form.type];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">
              {editingId ? "Edit Entry" : "New Changelog Entry"}
            </h1>
            <p className="text-xs text-zinc-500">
              {hasUnsavedChanges ? (
                <span className="text-amber-400">Unsaved changes</span>
              ) : editingId ? (
                "Editing existing entry"
              ) : (
                "Write in Markdown — preview with the eye tab"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editingId && (
            <label className="mr-2 flex items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => updateField("isPublished", e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
              />
              Publish immediately
            </label>
          )}
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !form.title.trim() || !form.version.trim()}
          >
            {isSaving
              ? "Saving..."
              : editingId
                ? "Update Entry"
                : "Create Entry"}
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="mt-4 grid flex-1 gap-6 overflow-hidden lg:grid-cols-[1fr_320px]">
        {/* Left: Editor area */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          {/* Title */}
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Changelog entry title..."
            className="mb-4 w-full border-b border-zinc-800 bg-transparent pb-3 text-xl font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
          />

          {/* Editor tabs + toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={() => setEditorTab("write")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  editorTab === "write"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Code className="h-3.5 w-3.5" />
                Write
              </button>
              <button
                onClick={() => setEditorTab("preview")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  editorTab === "preview"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            </div>

            {/* Toolbar (only in write mode) */}
            {editorTab === "write" && (
              <div className="flex items-center gap-0.5">
                <ToolbarButton
                  icon={<Heading2 className="h-3.5 w-3.5" />}
                  title="Heading 2"
                  onClick={() => insertAtCursor("\n### ", "\n")}
                />
                <ToolbarButton
                  icon={<Heading3 className="h-3.5 w-3.5" />}
                  title="Heading 3"
                  onClick={() => insertAtCursor("\n#### ", "\n")}
                />
                <div className="mx-1 h-4 w-px bg-zinc-800" />
                <ToolbarButton
                  icon={<Bold className="h-3.5 w-3.5" />}
                  title="Bold"
                  onClick={() => insertAtCursor("**", "**")}
                />
                <ToolbarButton
                  icon={<Italic className="h-3.5 w-3.5" />}
                  title="Italic"
                  onClick={() => insertAtCursor("*", "*")}
                />
                <ToolbarButton
                  icon={<Code className="h-3.5 w-3.5" />}
                  title="Inline code"
                  onClick={() => insertAtCursor("`", "`")}
                />
                <div className="mx-1 h-4 w-px bg-zinc-800" />
                <ToolbarButton
                  icon={<List className="h-3.5 w-3.5" />}
                  title="Bullet list"
                  onClick={() => insertAtCursor("\n- ")}
                />
                <ToolbarButton
                  icon={<ListOrdered className="h-3.5 w-3.5" />}
                  title="Numbered list"
                  onClick={() => insertAtCursor("\n1. ")}
                />
                <ToolbarButton
                  icon={<Quote className="h-3.5 w-3.5" />}
                  title="Blockquote"
                  onClick={() => insertAtCursor("\n> ")}
                />
                <ToolbarButton
                  icon={<Minus className="h-3.5 w-3.5" />}
                  title="Divider"
                  onClick={() => insertAtCursor("\n---\n")}
                />
                <ToolbarButton
                  icon={<Link className="h-3.5 w-3.5" />}
                  title="Link"
                  onClick={() => insertAtCursor("[", "](url)")}
                />
              </div>
            )}
          </div>

          {/* Content area */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            {editorTab === "write" ? (
              <textarea
                ref={textareaRef}
                value={form.content}
                onChange={(e) => updateField("content", e.target.value)}
                placeholder="Write your changelog entry in Markdown...

### What's New
- Feature one
- Feature two

### Bug Fixes
- Fixed something important

### Breaking Changes
- Changed API endpoint..."
                className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-zinc-300 placeholder:text-zinc-700 focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <div className="h-full overflow-auto p-6">
                {form.content.trim() ? (
                  <MarkdownPreview content={form.content} />
                ) : (
                  <p className="text-sm italic text-zinc-600">
                    Nothing to preview yet. Switch to Write and add some
                    content.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Metadata sidebar */}
        <div className="flex flex-col gap-4 overflow-auto">
          {/* Version */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Version
            </label>
            <input
              type="text"
              value={form.version}
              onChange={(e) => updateField("version", e.target.value)}
              placeholder="v1.8.0"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Type selector */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Change Type
            </label>
            <div className="space-y-1.5">
              {TYPE_OPTIONS.map((opt) => {
                const tc = TYPE_CONFIG[opt.value];
                const isSelected = form.type === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateField("type", opt.value)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-all",
                      isSelected
                        ? `${tc.bgColor} ${tc.borderColor} ${tc.color}`
                        : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
                    )}
                  >
                    <CircleDot
                      className={cn(
                        "h-3.5 w-3.5",
                        isSelected ? tc.color : "text-zinc-600"
                      )}
                    />
                    <span className={cn("font-mono text-xs", tc.color)}>
                      {tc.prefix}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live preview card */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Preview Card
            </label>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-zinc-500">
                  {new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {form.version && (
                  <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                    {form.version}
                  </span>
                )}
                {config && (
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px]",
                      config.bgColor,
                      config.borderColor,
                      config.color
                    )}
                  >
                    {config.prefix} {config.label}
                  </span>
                )}
              </div>
              <p className="mt-2 flex items-center gap-1 text-sm font-medium text-zinc-100">
                <ChevronRight className="h-3 w-3 text-emerald-500" />
                {form.title || (
                  <span className="italic text-zinc-600">Untitled</span>
                )}
              </p>
              {form.content && (
                <p className="mt-1 line-clamp-3 text-xs text-zinc-500">
                  {form.content.replace(/[#*`\[\]]/g, "").slice(0, 120)}...
                </p>
              )}
            </div>
          </div>

          {/* Markdown cheat sheet */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Markdown Reference
            </label>
            <div className="space-y-1.5 font-mono text-[11px] text-zinc-500">
              <p>
                <span className="text-zinc-400">### </span>Heading
              </p>
              <p>
                <span className="text-zinc-400">**</span>bold
                <span className="text-zinc-400">**</span>
              </p>
              <p>
                <span className="text-zinc-400">*</span>italic
                <span className="text-zinc-400">*</span>
              </p>
              <p>
                <span className="text-zinc-400">`</span>code
                <span className="text-zinc-400">`</span>
              </p>
              <p>
                <span className="text-zinc-400">- </span>bullet list
              </p>
              <p>
                <span className="text-zinc-400">1. </span>numbered list
              </p>
              <p>
                <span className="text-zinc-400">[text]</span>(url)
              </p>
              <p>
                <span className="text-zinc-400">&gt; </span>blockquote
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Toolbar Button
// ==========================================

function ToolbarButton({
  icon,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
    >
      {icon}
    </button>
  );
}

// ==========================================
// Markdown Preview (matches public site style)
// ==========================================

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-zinc-400 [&_a]:text-blue-400 [&_a]:hover:underline [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-green-400 [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-zinc-300 [&_hr]:my-4 [&_hr]:border-zinc-800 [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mt-2 [&_strong]:text-zinc-200 [&_ul]:mt-2 [&_ul]:space-y-1 [&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-500">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
