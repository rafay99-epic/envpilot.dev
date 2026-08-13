import { createFileRoute } from "@tanstack/react-router";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { formatDate, formatDateTime } from "@/lib/utils";
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
  Clock,
  CheckSquare,
  Square,
  CalendarClock,
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

/** Get the types array from an entry, falling back to [entry.type] for backward compat */
function getEntryTypes(entry: { type: string; types?: string[] }): string[] {
  return entry.types ?? [entry.type];
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
  const entries = useAdminQuery(
    api.features.admin.changelog.listAllChangelog,
    {}
  );
  const deleteEntry = useAdminMutation(
    api.features.admin.changelog.deleteChangelog
  );
  const togglePublish = useAdminMutation(
    api.features.admin.changelog.toggleChangelogPublish
  );

  const filterType = useChangelogStore((s) => s.filterType);
  const openCreate = useChangelogStore((s) => s.openCreate);
  const openEdit = useChangelogStore((s) => s.openEdit);
  const setFilterType = useChangelogStore((s) => s.setFilterType);

  const filteredEntries =
    entries && filterType !== "all"
      ? entries.filter((e) => getEntryTypes(e).includes(filterType))
      : entries;

  const publishedCount =
    entries?.filter(
      (e) =>
        e.publishStatus === "published" || (!e.publishStatus && e.isPublished)
    ).length ?? 0;
  const scheduledCount =
    entries?.filter((e) => e.publishStatus === "scheduled").length ?? 0;
  const draftCount =
    entries?.filter(
      (e) =>
        e.publishStatus === "draft" ||
        (!e.publishStatus && !e.isPublished && e.publishStatus !== "scheduled")
    ).length ?? 0;

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
    const entryTypes = (entry.types ?? [entry.type]) as ChangelogType[];
    openEdit(entry._id, {
      title: entry.title ?? "",
      content: entry.content ?? "",
      version: entry.version ?? "",
      types: entryTypes.length > 0 ? entryTypes : ["feature"],
      publishMode:
        entry.publishStatus === "scheduled"
          ? "scheduled"
          : entry.isPublished
            ? "immediate"
            : "draft",
      scheduledFor: entry.scheduledFor
        ? new Date(entry.scheduledFor).toISOString().slice(0, 16)
        : null,
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Changelog</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            {entries
              ? `${publishedCount} published${scheduledCount > 0 ? `, ${scheduledCount} scheduled` : ""}, ${draftCount} drafts`
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
                    ? "border-accent-line bg-accent-soft text-accent"
                    : "border-line text-ink-subtle hover:border-line hover:text-ink-muted"
                )}
              >
                {config && (
                  <span className={cn("mr-1", config.color)}>
                    {config.prefix}
                  </span>
                )}
                {type === "all" ? "All" : config?.label}
                {type !== "all" && entries && (
                  <span className="ml-1.5 text-ink-faint">
                    {
                      entries.filter((e) => getEntryTypes(e).includes(type))
                        .length
                    }
                  </span>
                )}
              </button>
            );
          }
        )}
      </div>

      {/* Entries */}
      <QueryState
        data={filteredEntries}
        empty={{
          message:
            filterType !== "all"
              ? `No ${TYPE_CONFIG[filterType].label.toLowerCase()} entries found.`
              : "Create your first changelog entry to get started.",
        }}
      >
        {(list) => (
          <div className="space-y-3">
            {list.map((entry) => {
              const entryTypes = getEntryTypes(entry);
              const primaryConfig = TYPE_CONFIG[entryTypes[0] as ChangelogType];
              return (
                <Card
                  key={entry._id}
                  className="group flex items-start gap-4 transition-colors hover:border-line"
                >
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1">
                    <div
                      className={cn(
                        "h-3 w-3 rounded-full",
                        primaryConfig?.bgColor ?? "bg-surface-hover",
                        primaryConfig?.borderColor
                          ? `border ${primaryConfig.borderColor}`
                          : "border border-line-strong"
                      )}
                    />
                    <div className="mt-2 h-full w-px bg-surface-raised" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-subtle">
                        {formatDate(entry.publishedAt ?? entry._creationTime)}
                      </span>
                      <span className="text-ink-faint">&middot;</span>
                      {entry.version && (
                        <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-subtle">
                          {entry.version}
                        </span>
                      )}
                      {/* Type badges — render all types */}
                      {entryTypes.map((t) => {
                        const tc = TYPE_CONFIG[t as ChangelogType];
                        return tc ? (
                          <Badge key={t} variant={typeBadgeVariant(t)}>
                            {tc.prefix} {tc.label}
                          </Badge>
                        ) : null;
                      })}
                      {/* Publish status */}
                      {entry.publishStatus === "scheduled" ? (
                        <Badge variant="info">
                          <CalendarClock className="mr-1 h-2.5 w-2.5" />
                          Scheduled
                          {entry.scheduledFor
                            ? ` ${formatDateTime(entry.scheduledFor)}`
                            : ""}
                        </Badge>
                      ) : entry.isPublished ? (
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
                    <h3 className="mt-2 flex items-center gap-1.5 font-medium text-ink">
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                      {entry.title}
                    </h3>

                    {/* Content preview */}
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-subtle">
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
                      aria-label={
                        entry.isPublished
                          ? `Unpublish ${entry.title}`
                          : `Publish ${entry.title}`
                      }
                    >
                      {entry.isPublished ? (
                        <GlobeLock className="h-3.5 w-3.5" />
                      ) : (
                        <Globe className="h-3.5 w-3.5 text-accent" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(entry)}
                      title="Edit"
                      aria-label={`Edit ${entry.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry._id)}
                      title="Delete"
                      aria-label={`Delete ${entry.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </QueryState>
    </div>
  );
}

// ==========================================
// Editor View — Full-Screen
// ==========================================

function EditorView() {
  const createEntry = useAdminMutation(
    api.features.admin.changelog.createChangelog
  );
  const updateEntry = useAdminMutation(
    api.features.admin.changelog.updateChangelog
  );

  const {
    editingId,
    form,
    editorTab,
    isSaving,
    hasUnsavedChanges,
    closeEditor,
    updateField,
    toggleType,
    setEditorTab,
    setSaving,
    markSaved,
  } = useChangelogStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = async () => {
    if (!form.title.trim() || !form.version.trim()) return;

    // Validate scheduled time is in the future
    if (form.publishMode === "scheduled") {
      if (!form.scheduledFor) return;
      const scheduledTs = new Date(form.scheduledFor).getTime();
      if (scheduledTs <= Date.now()) return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateEntry({
          id: editingId,
          title: form.title,
          content: form.content,
          version: form.version,
          type: form.types[0],
          types: form.types,
          isPublished: form.publishMode === "immediate",
          scheduledFor:
            form.publishMode === "scheduled" && form.scheduledFor
              ? new Date(form.scheduledFor).getTime()
              : undefined,
        });
      } else {
        await createEntry({
          title: form.title,
          content: form.content,
          version: form.version,
          type: form.types[0],
          types: form.types,
          isPublished: form.publishMode === "immediate",
          scheduledFor:
            form.publishMode === "scheduled" && form.scheduledFor
              ? new Date(form.scheduledFor).getTime()
              : undefined,
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink">
              {editingId ? "Edit Entry" : "New Changelog Entry"}
            </h1>
            <p className="text-xs text-ink-subtle">
              {hasUnsavedChanges ? (
                <span className="text-warning">Unsaved changes</span>
              ) : editingId ? (
                "Editing existing entry"
              ) : (
                "Write in Markdown — preview with the eye tab"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isSaving ||
              !form.title.trim() ||
              !form.version.trim() ||
              (form.publishMode === "scheduled" && !form.scheduledFor)
            }
          >
            {isSaving
              ? "Saving..."
              : editingId
                ? "Update Entry"
                : form.publishMode === "immediate"
                  ? "Publish Now"
                  : form.publishMode === "scheduled"
                    ? "Schedule Entry"
                    : "Save Draft"}
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <div className="mt-4 grid flex-1 gap-6 overflow-hidden lg:grid-cols-[1fr_320px]">
        {/* Left: Editor area */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          {/* Title */}
          <Input
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Changelog entry title..."
            className="mb-4 rounded-none border-x-0 border-t-0 border-b border-line bg-transparent px-0 pb-3 text-xl font-semibold text-ink placeholder:text-ink-faint focus:border-accent-line focus:ring-0"
          />

          {/* Editor tabs + toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              <button
                onClick={() => setEditorTab("write")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  editorTab === "write"
                    ? "bg-surface-raised text-ink"
                    : "text-ink-subtle hover:text-ink-muted"
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
                    ? "bg-surface-raised text-ink"
                    : "text-ink-subtle hover:text-ink-muted"
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
                <div className="mx-1 h-4 w-px bg-surface-raised" />
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
                <div className="mx-1 h-4 w-px bg-surface-raised" />
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
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-canvas">
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
                className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-ink-muted placeholder:text-ink-faint focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <div className="h-full overflow-auto p-6">
                {form.content.trim() ? (
                  <MarkdownPreview content={form.content} />
                ) : (
                  <p className="text-sm italic text-ink-faint">
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
          <div className="rounded-lg border border-line bg-surface p-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-ink-subtle">
              Version
            </label>
            <Input
              type="text"
              value={form.version}
              onChange={(e) => updateField("version", e.target.value)}
              placeholder="v1.8.0"
              className="bg-canvas"
            />
          </div>

          {/* Change type selector — multi-select */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-subtle">
              Change Types
            </label>
            <p className="mb-3 text-[10px] text-ink-faint">
              Select one or more types
            </p>
            <div className="space-y-1.5">
              {TYPE_OPTIONS.map((opt) => {
                const tc = TYPE_CONFIG[opt.value];
                const isSelected = form.types.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleType(opt.value)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-all",
                      isSelected
                        ? `${tc.bgColor} ${tc.borderColor} ${tc.color}`
                        : "border-line text-ink-muted hover:border-line hover:text-ink-muted"
                    )}
                  >
                    {isSelected ? (
                      <CheckSquare className={cn("h-3.5 w-3.5", tc.color)} />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-ink-faint" />
                    )}
                    <span className={cn("font-mono text-xs", tc.color)}>
                      {tc.prefix}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Publish mode selector */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-ink-subtle">
              Publishing
            </label>
            <div className="space-y-1.5">
              <button
                onClick={() => updateField("publishMode", "draft")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-all",
                  form.publishMode === "draft"
                    ? "border-line-strong bg-surface-raised text-ink"
                    : "border-line text-ink-muted hover:border-line hover:text-ink-muted"
                )}
              >
                <GlobeLock className="h-3.5 w-3.5" />
                Save as Draft
              </button>
              <button
                onClick={() => updateField("publishMode", "immediate")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-all",
                  form.publishMode === "immediate"
                    ? "border-accent-line bg-accent-soft text-accent"
                    : "border-line text-ink-muted hover:border-line hover:text-ink-muted"
                )}
              >
                <Globe className="h-3.5 w-3.5" />
                Publish Now
              </button>
              <button
                onClick={() => updateField("publishMode", "scheduled")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-all",
                  form.publishMode === "scheduled"
                    ? "border-info-line bg-info-soft text-info"
                    : "border-line text-ink-muted hover:border-line hover:text-ink-muted"
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Schedule for Later
              </button>
            </div>

            {/* Date/time picker when scheduling */}
            {form.publishMode === "scheduled" && (
              <div className="mt-3 space-y-2">
                <Input
                  type="datetime-local"
                  value={form.scheduledFor ?? ""}
                  onChange={(e) =>
                    updateField("scheduledFor", e.target.value || null)
                  }
                  min={new Date().toISOString().slice(0, 16)}
                  className="bg-canvas focus:border-info-line focus:ring-info-line [&::-webkit-calendar-picker-indicator]:invert"
                />
                {form.scheduledFor && (
                  <p className="text-[10px] text-ink-subtle">
                    <Clock className="mr-1 inline h-3 w-3" />
                    Publishes within 5 minutes of scheduled time
                  </p>
                )}
                {form.scheduledFor &&
                  new Date(form.scheduledFor).getTime() <= Date.now() && (
                    <p className="text-[10px] text-danger">
                      Scheduled time must be in the future
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* Live preview card */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-ink-subtle">
              Preview Card
            </label>
            <div className="rounded-lg border border-line bg-canvas p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-ink-subtle">
                  {form.publishMode === "scheduled" && form.scheduledFor
                    ? new Date(form.scheduledFor).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                </span>
                {form.version && (
                  <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-subtle">
                    {form.version}
                  </span>
                )}
                {form.types.map((t) => {
                  const tc = TYPE_CONFIG[t];
                  return tc ? (
                    <span
                      key={t}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px]",
                        tc.bgColor,
                        tc.borderColor,
                        tc.color
                      )}
                    >
                      {tc.prefix} {tc.label}
                    </span>
                  ) : null;
                })}
              </div>
              <p className="mt-2 flex items-center gap-1 text-sm font-medium text-ink">
                <ChevronRight className="h-3 w-3 text-accent" />
                {form.title || (
                  <span className="italic text-ink-faint">Untitled</span>
                )}
              </p>
              {form.content && (
                <p className="mt-1 line-clamp-3 text-xs text-ink-subtle">
                  {form.content.replace(/[#*`\[\]]/g, "").slice(0, 120)}...
                </p>
              )}
            </div>
          </div>

          {/* Markdown cheat sheet */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-ink-subtle">
              Markdown Reference
            </label>
            <div className="space-y-1.5 font-mono text-[11px] text-ink-subtle">
              <p>
                <span className="text-ink-muted">### </span>Heading
              </p>
              <p>
                <span className="text-ink-muted">**</span>bold
                <span className="text-ink-muted">**</span>
              </p>
              <p>
                <span className="text-ink-muted">*</span>italic
                <span className="text-ink-muted">*</span>
              </p>
              <p>
                <span className="text-ink-muted">`</span>code
                <span className="text-ink-muted">`</span>
              </p>
              <p>
                <span className="text-ink-muted">- </span>bullet list
              </p>
              <p>
                <span className="text-ink-muted">1. </span>numbered list
              </p>
              <p>
                <span className="text-ink-muted">[text]</span>(url)
              </p>
              <p>
                <span className="text-ink-muted">&gt; </span>blockquote
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
      className="rounded p-1.5 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted"
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
    <div className="text-sm leading-relaxed text-ink-muted [&_a]:text-info [&_a]:hover:underline [&_code]:rounded [&_code]:bg-surface-raised [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-accent [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink [&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-ink-muted [&_hr]:my-4 [&_hr]:border-line [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mt-2 [&_strong]:text-ink [&_ul]:mt-2 [&_ul]:space-y-1 [&_blockquote]:mt-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-subtle">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
