import { createFileRoute } from "@tanstack/react-router";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { SearchInput } from "@/components/ui/SearchInput";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { QueryState } from "@/components/ui/QueryState";
import { useFilteredList } from "@/hooks/useFilteredList";
import { cn, formatDate } from "@/lib/utils";
import {
  Trash2,
  Save,
  ThumbsUp,
  GripVertical,
  ArrowRight,
  Plus,
  X,
  Sparkles,
  Maximize2,
  User,
  Calendar,
  Tag,
} from "lucide-react";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  useFeatureRequestStore,
  STATUS_COLUMNS,
  type FeatureRequestStatus,
} from "@/stores/feature-request-store";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/feature-requests")({
  component: FeatureRequestsPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RequestItem = Record<string, any>;

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

const STATUS_BADGE_VARIANT: Record<FeatureRequestStatus, BadgeVariant> = {
  submitted: "default",
  under_review: "info",
  planned: "purple",
  in_progress: "warning",
  completed: "success",
  declined: "danger",
};

function FeatureRequestsPage() {
  const requests = useAdminQuery(
    api.features.admin.featureRequests.listFeatureRequests,
    {}
  );
  const updateStatus = useAdminMutation(
    api.features.admin.featureRequests.updateFeatureRequestStatus
  );
  const updateNotes = useAdminMutation(
    api.features.admin.featureRequests.updateFeatureRequestAdminNotes
  );
  const deleteRequest = useAdminMutation(
    api.features.admin.featureRequests.deleteFeatureRequest
  );
  const createRequest = useAdminMutation(
    api.features.admin.featureRequests.createFeatureRequest
  );
  const clearAll = useAdminMutation(
    api.features.admin.featureRequests.clearAllFeatureRequests
  );
  const { confirm } = useConfirmStore();

  const store = useFeatureRequestStore();
  const {
    search,
    setSearch,
    expandedId,
    setExpandedId,
    editingNotes,
    setNoteForId,
    initNoteForId,
    savingNoteId,
    setSavingNoteId,
    isCreating,
    openCreator,
    closeCreator,
    createForm,
    setCreateField,
    resetCreateForm,
    isCreateDirty,
  } = store;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const filtered = useFilteredList(requests, search, (r) => [
    r.title,
    r.description,
    r.category,
  ]);

  const handleSaveNotes = async (requestId: Id<"featureRequests">) => {
    setSavingNoteId(requestId);
    try {
      await updateNotes({
        id: requestId,
        adminNotes: editingNotes[requestId] ?? "",
      });
    } finally {
      setSavingNoteId(null);
    }
  };

  const handleDelete = async (requestId: Id<"featureRequests">) => {
    const ok = await confirm({
      title: "Delete Feature Request",
      message:
        "This feature request and all its votes will be permanently deleted.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteRequest({ id: requestId });
    if (expandedId === requestId) setExpandedId(null);
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: "Clear All Feature Requests",
      message: `This will permanently delete all ${requests?.length ?? 0} feature requests and their votes. This cannot be undone.`,
      confirmLabel: "Delete All",
      variant: "danger",
    });
    if (!ok) return;
    await clearAll({});
  };

  const handleDiscard = async () => {
    if (isCreateDirty()) {
      const ok = await confirm({
        title: "Discard Feature",
        message:
          "You have unsaved changes. Are you sure you want to discard them?",
        confirmLabel: "Discard",
        variant: "warning",
      });
      if (!ok) return;
    }
    resetCreateForm();
    closeCreator();
  };

  const handleCreate = async () => {
    if (!createForm.title.trim() || !createForm.description.trim()) return;
    setIsSubmitting(true);
    try {
      await createRequest({
        title: createForm.title,
        description: createForm.description,
        category: createForm.category.trim() || undefined,
        adminNotes: createForm.adminNotes.trim() || undefined,
        status: createForm.status,
      });
      resetCreateForm();
      closeCreator();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    createForm.title.trim().length > 0 &&
    createForm.description.trim().length > 0 &&
    !isSubmitting;

  const openDetail = (req: RequestItem) => {
    setExpandedId(req._id);
    initNoteForId(req._id, (req.adminNotes as string) ?? "");
  };

  return (
    <div data-wide>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">
          Feature Requests
        </h1>
        <div className="flex items-center gap-2">
          {requests && (
            <span className="mr-1 text-sm text-zinc-500">
              {requests.length} total
            </span>
          )}
          {requests && requests.length > 0 && (
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </Button>
          )}
          {!isCreating && (
            <Button size="sm" onClick={openCreator}>
              <Plus className="h-3.5 w-3.5" />
              Add Feature
            </Button>
          )}
        </div>
      </div>

      {/* Creator Panel */}
      {isCreating && (
        <CreatorPanel
          createForm={createForm}
          setCreateField={setCreateField}
          onDiscard={handleDiscard}
          onCreate={handleCreate}
          canSubmit={canSubmit}
          isSubmitting={isSubmitting}
        />
      )}

      <QueryState
        data={requests}
        empty={{
          message:
            "No feature requests. Add your first feature to get started.",
          when: (requests?.length ?? 0) === 0 && !isCreating,
        }}
      >
        {(reqs) => {
          const byStatus = (status: FeatureRequestStatus) =>
            (filtered ?? reqs).filter((r) => r.status === status);

          const activeItem = activeId
            ? reqs.find((r) => r._id === activeId)
            : null;
          const activeItemCol = activeItem
            ? STATUS_COLUMNS.find((c) => c.value === activeItem.status)
            : null;
          const targetCol = overColumnId
            ? STATUS_COLUMNS.find((c) => c.value === overColumnId)
            : null;
          const detailItem = expandedId
            ? reqs.find((r) => r._id === expandedId)
            : null;

          const handleDragStart = (event: DragStartEvent) => {
            setActiveId(event.active.id as string);
            setExpandedId(null);
          };

          const handleDragOver = (event: DragOverEvent) => {
            const overId = event.over?.id as string | undefined;
            if (!overId) {
              setOverColumnId(null);
              return;
            }
            const col = STATUS_COLUMNS.find((c) => c.value === overId);
            if (col) {
              setOverColumnId(col.value);
            } else {
              const overItem = reqs.find((r) => r._id === overId);
              if (overItem) setOverColumnId(overItem.status);
            }
          };

          const handleDragEnd = (event: DragEndEvent) => {
            const { active, over } = event;
            setActiveId(null);
            setOverColumnId(null);

            if (!over) return;

            const draggedId = active.id as string;
            const overId = over.id as string;

            let targetStatus: FeatureRequestStatus | null = null;
            const col = STATUS_COLUMNS.find((c) => c.value === overId);
            if (col) {
              targetStatus = col.value;
            } else {
              const overItem = reqs.find((r) => r._id === overId);
              if (overItem)
                targetStatus = overItem.status as FeatureRequestStatus;
            }

            if (!targetStatus) return;

            const draggedItem = reqs.find((r) => r._id === draggedId);
            if (!draggedItem || draggedItem.status === targetStatus) return;

            updateStatus({
              id: draggedId as Id<"featureRequests">,
              status: targetStatus,
            });
          };

          const handleDragCancel = () => {
            setActiveId(null);
            setOverColumnId(null);
          };

          return (
            <>
              {/* Search */}
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search requests..."
                className="mb-6 max-w-sm"
              />

              {/* Kanban Board */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {STATUS_COLUMNS.map((col) => {
                    const items = byStatus(col.value);
                    const isDragOverThis =
                      overColumnId === col.value &&
                      activeId !== null &&
                      !items.some((i) => i._id === activeId);

                    return (
                      <KanbanColumn
                        key={col.value}
                        col={col}
                        items={items}
                        isDragOverThis={isDragOverThis}
                        isDragActive={activeId !== null}
                        onOpenDetail={openDetail}
                        handleDelete={handleDelete}
                        activeId={activeId}
                      />
                    );
                  })}
                </div>

                {/* Drag Overlay */}
                <DragOverlay dropAnimation={null}>
                  {activeItem ? (
                    <div
                      className={`w-72 rotate-[1.5deg] rounded-lg border bg-zinc-900 p-3 shadow-lg transition-transform ${
                        targetCol && targetCol.value !== activeItemCol?.value
                          ? `${targetCol.border} ${targetCol.glowShadow}`
                          : "border-zinc-600 shadow-zinc-900/50"
                      }`}
                      style={{ willChange: "transform" }}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold leading-snug text-zinc-100">
                          {activeItem.title}
                        </h4>
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="purple">
                          {activeItem.category ?? "general"}
                        </Badge>
                        <span className="flex items-center gap-0.5 text-[10px] text-zinc-400">
                          <ThumbsUp className="h-2.5 w-2.5" />
                          {activeItem.voteCount ?? 0}
                        </span>
                      </div>
                      {targetCol &&
                        targetCol.value !== activeItemCol?.value && (
                          <div className="mt-2.5 flex items-center gap-1.5 border-t border-zinc-800 pt-2">
                            <ArrowRight
                              className={`h-3 w-3 ${targetCol.dropText}`}
                            />
                            <span
                              className={`text-[10px] font-semibold ${targetCol.dropText}`}
                            >
                              {targetCol.label}
                            </span>
                          </div>
                        )}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>

              {/* Full-Screen Detail Modal */}
              {detailItem && (
                <DetailModal
                  req={detailItem}
                  onClose={() => setExpandedId(null)}
                  editingNotes={editingNotes}
                  setNoteForId={setNoteForId}
                  savingNoteId={savingNoteId}
                  handleSaveNotes={handleSaveNotes}
                  handleDelete={handleDelete}
                  updateStatus={updateStatus}
                />
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

/* ─── Detail Modal ─── */

interface DetailModalProps {
  req: RequestItem;
  onClose: () => void;
  editingNotes: Record<string, string>;
  setNoteForId: (id: string, note: string) => void;
  savingNoteId: string | null;
  handleSaveNotes: (id: Id<"featureRequests">) => void;
  handleDelete: (id: Id<"featureRequests">) => void;
  updateStatus: (args: {
    id: Id<"featureRequests">;
    status: FeatureRequestStatus;
  }) => void;
}

function DetailModal({
  req,
  onClose,
  editingNotes,
  setNoteForId,
  savingNoteId,
  handleSaveNotes,
  handleDelete,
  updateStatus,
}: DetailModalProps) {
  const { confirm } = useConfirmStore();
  const currentCol = STATUS_COLUMNS.find((c) => c.value === req.status);

  const serverNotes = (req.adminNotes as string) ?? "";
  const localNotes = editingNotes[req._id] ?? "";
  const hasUnsavedNotes = localNotes !== serverNotes;

  const safeClose = async () => {
    if (hasUnsavedNotes) {
      const ok = await confirm({
        title: "Unsaved Notes",
        message:
          "You have unsaved admin notes. Close anyway? Your edits will be preserved if you reopen this card.",
        confirmLabel: "Close",
        variant: "warning",
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal isOpen onClose={safeClose} title={req.title} className="max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {currentCol && (
          <Badge variant={STATUS_BADGE_VARIANT[currentCol.value]}>
            {currentCol.label}
          </Badge>
        )}
        <Badge variant="purple">{req.category ?? "general"}</Badge>
        <span className="flex items-center gap-1 text-xs text-zinc-500">
          <ThumbsUp className="h-3 w-3" />
          {req.voteCount ?? 0} votes
        </span>
      </div>

      <div className="max-h-[60vh] overflow-y-auto pr-1">
        <div className="grid gap-6 lg:grid-cols-[1fr,240px]">
          {/* Left */}
          <div className="space-y-6">
            {/* Description */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Description
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {req.description ?? "No description provided."}
              </p>
            </div>

            {/* Status — Move to */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Move to
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_COLUMNS.filter((s) => s.value !== req.status).map(
                  (s) => (
                    <button
                      key={s.value}
                      onClick={() =>
                        updateStatus({ id: req._id, status: s.value })
                      }
                      aria-label={`Move to ${s.label}`}
                      className="transition-transform duration-150 hover:scale-[1.05] active:scale-[0.97]"
                    >
                      <Badge variant={STATUS_BADGE_VARIANT[s.value]}>
                        {s.label}
                      </Badge>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Admin Notes */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Admin Notes
              </h3>
              <Textarea
                id={`detail-notes-${req._id}`}
                value={editingNotes[req._id] ?? ""}
                onChange={(e) => setNoteForId(req._id, e.target.value)}
                placeholder="Implementation details, technical notes, blockers, decisions..."
                rows={6}
                className="text-sm"
              />
              <div className="mt-3 flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => handleSaveNotes(req._id)}
                  disabled={savingNoteId === req._id || !hasUnsavedNotes}
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingNoteId === req._id ? "Saving..." : "Save Notes"}
                </Button>
                {hasUnsavedNotes && (
                  <span className="text-[11px] text-amber-400/80">
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                <User className="h-3 w-3" />
                Submitter
              </h4>
              <p className="text-sm text-zinc-300">
                {req.submitterName ?? "Anonymous"}
              </p>
              {req.submitterEmail && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  {req.submitterEmail}
                </p>
              )}
            </div>

            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                <Tag className="h-3 w-3" />
                Category
              </h4>
              <Badge variant="purple">{req.category ?? "general"}</Badge>
            </div>

            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                <Calendar className="h-3 w-3" />
                Created
              </h4>
              <p className="text-sm text-zinc-400">
                {formatDate(req._creationTime)}
              </p>
            </div>

            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                <ThumbsUp className="h-3 w-3" />
                Votes
              </h4>
              <p className="text-sm text-zinc-300">{req.voteCount ?? 0}</p>
            </div>

            {/* ID */}
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                ID
              </h4>
              <p className="break-all font-mono text-[10px] text-zinc-600">
                {req._id}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-zinc-800/60 pt-4">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            handleDelete(req._id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Feature
        </Button>
        <Button variant="outline" size="sm" onClick={safeClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

/* ─── Creator Panel ─── */

interface CreatorPanelProps {
  createForm: {
    title: string;
    description: string;
    category: string;
    status: FeatureRequestStatus;
    adminNotes: string;
  };
  setCreateField: <K extends keyof CreatorPanelProps["createForm"]>(
    key: K,
    value: CreatorPanelProps["createForm"][K]
  ) => void;
  onDiscard: () => void;
  onCreate: () => void;
  canSubmit: boolean;
  isSubmitting: boolean;
}

function CreatorPanel({
  createForm,
  setCreateField,
  onDiscard,
  onCreate,
  canSubmit,
  isSubmitting,
}: CreatorPanelProps) {
  return (
    <div className="mb-6 rounded-xl border border-emerald-500/20 bg-zinc-900/80 shadow-lg shadow-emerald-500/5">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold text-zinc-100">
            New Feature
          </span>
          <Badge variant="success">Team</Badge>
        </div>
        <button
          onClick={onDiscard}
          aria-label="Discard new feature"
          className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form Body */}
      <div className="p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr,280px]">
          <div className="space-y-4">
            <Input
              label="Title"
              id="create-title"
              placeholder="e.g. GitHub Actions CI/CD integration"
              value={createForm.title}
              onChange={(e) => setCreateField("title", e.target.value)}
              className="text-sm"
            />
            <Textarea
              label="Description"
              id="create-description"
              placeholder="Describe what this feature does, why it matters, and how it should work..."
              value={createForm.description}
              onChange={(e) => setCreateField("description", e.target.value)}
              rows={5}
              className="text-sm"
            />
            <Textarea
              label="Admin Notes (internal)"
              id="create-notes"
              placeholder="Implementation details, technical notes, blockers..."
              value={createForm.adminNotes}
              onChange={(e) => setCreateField("adminNotes", e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>

          <div className="space-y-4">
            <Input
              label="Category"
              id="create-category"
              placeholder="e.g. Dashboard, CLI, Security"
              value={createForm.category}
              onChange={(e) => setCreateField("category", e.target.value)}
              className="text-sm"
            />

            <Select
              label="Initial Status"
              id="create-status"
              value={createForm.status}
              onChange={(e) =>
                setCreateField("status", e.target.value as FeatureRequestStatus)
              }
              options={STATUS_COLUMNS.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
            />

            <p className="text-[11px] leading-relaxed text-zinc-600">
              Team features are submitted as &quot;Envpilot Team&quot; and will
              appear on the public roadmap alongside community requests.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-zinc-800/60 pt-4">
          <Button variant="outline" size="sm" onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" onClick={onCreate} disabled={!canSubmit}>
            {isSubmitting ? (
              "Creating..."
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Create Feature
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Column ─── */

interface KanbanColumnProps {
  col: (typeof STATUS_COLUMNS)[number];
  items: RequestItem[];
  isDragOverThis: boolean;
  isDragActive: boolean;
  onOpenDetail: (req: RequestItem) => void;
  handleDelete: (id: Id<"featureRequests">) => void;
  activeId: string | null;
}

function KanbanColumn({
  col,
  items,
  isDragOverThis,
  isDragActive,
  onOpenDetail,
  handleDelete,
  activeId,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: col.value });
  const showDrop = isDragOverThis || (isOver && isDragActive);

  return (
    <div className="flex w-72 min-w-[288px] shrink-0 flex-col">
      <Card
        title={col.label}
        className={cn(
          "flex-1",
          showDrop && `${col.dropBorder} ${col.glowShadow} shadow-sm`
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full transition-shadow duration-200 ${col.dot} ${
              showDrop ? `shadow-[0_0_6px] ${col.glowShadow}` : ""
            }`}
          />
          <Badge variant={STATUS_BADGE_VARIANT[col.value]}>
            {items.length}
          </Badge>
        </div>

        {/* Droppable Area */}
        <div
          ref={setNodeRef}
          className={`flex min-h-40 flex-1 flex-col gap-2 rounded-lg transition-all duration-200 ${
            showDrop
              ? `border border-dashed p-1.5 ${col.dropBorder} ${col.dropBg}`
              : isDragActive
                ? "border border-dashed border-zinc-800/50 p-1.5"
                : "border border-transparent p-1.5"
          }`}
        >
          {items.length === 0 && !showDrop ? (
            <div
              className={`flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 transition-colors duration-200 ${
                isDragActive ? "border-zinc-700" : "border-zinc-800"
              }`}
            >
              <p className="text-[11px] text-zinc-600">No requests</p>
            </div>
          ) : (
            <>
              {items.map((req) => (
                <DraggableCard
                  key={req._id}
                  req={req}
                  isBeingDragged={activeId === req._id}
                  onOpenDetail={() => onOpenDetail(req)}
                  handleDelete={handleDelete}
                />
              ))}
              {showDrop && (
                <div
                  className={`flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-5 transition-all duration-200 ${col.dropBorder}`}
                >
                  <div
                    className={`h-1 w-1 animate-pulse rounded-full ${col.dot}`}
                  />
                  <p className={`text-[10px] font-medium ${col.dropText}`}>
                    Drop to move here
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ─── Card ─── */

interface DraggableCardProps {
  req: RequestItem;
  isBeingDragged: boolean;
  onOpenDetail: () => void;
  handleDelete: (id: Id<"featureRequests">) => void;
}

function DraggableCard({
  req,
  isBeingDragged,
  onOpenDetail,
  handleDelete,
}: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: req._id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/card rounded-lg border transition-all duration-200 ${
        isDragging || isBeingDragged
          ? "scale-[0.97] border-zinc-700/50 bg-zinc-900/30 opacity-30"
          : "border-zinc-800 bg-zinc-900/60 shadow-sm shadow-zinc-950/30 hover:border-zinc-700 hover:shadow-md hover:shadow-zinc-950/20"
      }`}
    >
      <div className="flex items-start gap-1.5 p-3">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="group/grip mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-zinc-700 transition-all duration-150 hover:bg-zinc-800 hover:text-zinc-400 active:cursor-grabbing active:scale-95 active:text-zinc-300"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5 transition-transform duration-150 group-hover/grip:scale-110" />
        </button>

        {/* Card Content */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-1">
            <h4
              className="cursor-pointer text-xs font-semibold leading-snug text-zinc-200 transition-colors hover:text-zinc-50"
              onClick={onOpenDetail}
            >
              {req.title}
            </h4>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                onClick={onOpenDetail}
                className="rounded p-0.5 text-zinc-700 opacity-0 transition-all group-hover/card:opacity-100 hover:bg-zinc-800 hover:text-zinc-400"
                aria-label="Open detail"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(req._id)}
                className="rounded p-0.5 text-zinc-700 opacity-0 transition-all group-hover/card:opacity-100 hover:bg-red-500/10 hover:text-red-400"
                aria-label="Delete feature request"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="purple">{req.category ?? "general"}</Badge>
            <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
              <ThumbsUp className="h-2.5 w-2.5" />
              {req.voteCount ?? 0}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
            <span>
              {req.submitterName ?? req.submitterEmail ?? "Anonymous"}
            </span>
            <span>{formatDate(req._creationTime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
