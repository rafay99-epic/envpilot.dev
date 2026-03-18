import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/changelog")({
  component: ChangelogPage,
});

type ChangelogType =
  | "feature"
  | "improvement"
  | "fix"
  | "security"
  | "breaking";

const TYPE_OPTIONS = [
  { value: "feature", label: "Feature" },
  { value: "improvement", label: "Improvement" },
  { value: "fix", label: "Bug Fix" },
  { value: "security", label: "Security" },
  { value: "breaking", label: "Breaking Change" },
];

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

interface ChangelogForm {
  title: string;
  content: string;
  version: string;
  type: ChangelogType;
  isPublished: boolean;
}

const emptyForm: ChangelogForm = {
  title: "",
  content: "",
  version: "",
  type: "feature",
  isPublished: false,
};

function ChangelogPage() {
  const entries = useAdminQuery(api.admin.listAllChangelog, {});
  const createEntry = useAdminMutation(api.admin.createChangelog);
  const updateEntry = useAdminMutation(api.admin.updateChangelog);
  const deleteEntry = useAdminMutation(api.admin.deleteChangelog);
  const togglePublish = useAdminMutation(api.admin.toggleChangelogPublish);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"changelog"> | null>(null);
  const [form, setForm] = useState<ChangelogForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (entry: NonNullable<typeof entries>[number]) => {
    setEditingId(entry._id);
    setForm({
      title: entry.title ?? "",
      content: entry.content ?? "",
      version: entry.version ?? "",
      type: (entry.type as ChangelogType) ?? "feature",
      isPublished: entry.isPublished ?? false,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
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
      setModalOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (entryId: Id<"changelog">) => {
    await togglePublish({ id: entryId });
  };

  const handleDelete = async (entryId: Id<"changelog">) => {
    if (!confirm("Delete this changelog entry?")) return;
    await deleteEntry({ id: entryId });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Changelog</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Entry
        </Button>
      </div>

      {!entries ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No changelog entries"
          description="Create your first changelog entry to get started."
        />
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry._id} className="flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="font-medium text-zinc-100">{entry.title}</h3>
                  {entry.version && (
                    <Badge variant="default">v{entry.version}</Badge>
                  )}
                  <Badge variant={typeBadgeVariant(entry.type)}>
                    {entry.type}
                  </Badge>
                  <Badge variant={entry.isPublished ? "success" : "warning"}>
                    {entry.isPublished ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="mb-1 line-clamp-2 text-sm text-zinc-400">
                  {entry.content}
                </p>
                <p className="text-xs text-zinc-600">
                  {formatDate(entry._creationTime)}
                </p>
              </div>
              <div className="ml-4 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTogglePublish(entry._id)}
                  title={entry.isPublished ? "Unpublish" : "Publish"}
                >
                  {entry.isPublished ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(entry)}
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
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setForm(emptyForm);
          setEditingId(null);
        }}
        title={editingId ? "Edit Changelog Entry" : "New Changelog Entry"}
      >
        <div className="space-y-4">
          <Input
            label="Title"
            id="changelog-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="What changed?"
          />
          <Textarea
            label="Content"
            id="changelog-content"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="Describe the changes in detail..."
            rows={5}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Version"
              id="changelog-version"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="1.2.0"
            />
            <Select
              label="Type"
              id="changelog-type"
              options={TYPE_OPTIONS}
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as ChangelogType })
              }
            />
          </div>
          {!editingId && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) =>
                  setForm({ ...form, isPublished: e.target.checked })
                }
                className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
              />
              Publish immediately
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setModalOpen(false);
                setForm(emptyForm);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
