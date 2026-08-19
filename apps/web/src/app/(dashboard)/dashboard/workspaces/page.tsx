"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Boxes, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import {
  useWorkspaces,
  useWorkspaceActions,
  useOrganizationProjects,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { Modal } from "@/components/ui";
import { sanitizeConvexError } from "@/lib/error-messages";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Workspaces list.
 *
 * A workspace holds variables that several projects share. It is not a
 * project and never appears in the projects grid, which is why it gets its
 * own sidebar entry directly under Projects.
 */
export default function WorkspacesPage() {
  const { organization, canDo } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { workspaces, isLoading } = useWorkspaces(orgId);
  const { create } = useWorkspaceActions();
  const projects = useOrganizationProjects(orgId);
  const canCreate = canDo("org:create_project");

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  async function handleCreate() {
    if (!orgId || name.trim().length === 0) return;
    setIsSaving(true);
    try {
      await create({
        organizationId: orgId,
        name: name.trim(),
        slug: slugify(name),
        projectIds: [...picked] as Id<"projects">[],
      });
      toast.success(
        picked.size > 0
          ? `Workspace created and linked to ${picked.size} ${picked.size === 1 ? "project" : "projects"}.`
          : "Workspace created"
      );
      setName("");
      setPicked(new Set());
      setIsOpen(false);
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsSaving(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Boxes}
        title="Workspaces"
        description="Variables several projects share. One copy, one rotation, no duplicates."
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted"
            >
              <Plus className="h-4 w-4" />
              New Workspace
            </button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      ) : workspaces.length === 0 ? (
        <div className="space-y-3 border border-line px-5 py-8">
          <p className="text-sm text-ink">No workspaces yet.</p>
          <p className="max-w-prose text-sm text-ink-muted">
            Put a credential that several projects need into a workspace, link
            those projects, and they all read the same row. Change it once and
            every project gets the new value. Nothing is copied, so nothing can
            drift.
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-xs text-ink-muted hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Create your first workspace
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {workspaces.map((workspace) => (
            <li key={workspace._id}>
              <Link
                href={`/dashboard/workspaces/${workspace.slug}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-surface-raised"
              >
                <span className="font-mono text-sm text-ink">
                  {workspace.name}
                </span>
                <span className="font-mono text-xs text-ink-muted">
                  {workspace.variableCount}{" "}
                  {workspace.variableCount === 1 ? "variable" : "variables"} ·
                  read by {workspace.projectCount}{" "}
                  {workspace.projectCount === 1 ? "project" : "projects"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="New workspace"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="workspace-name"
              className="block font-mono text-xs text-ink-muted"
            >
              Name
            </label>
            <input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="apple-signing"
              className="w-full border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
            />
            {name.trim().length > 0 && (
              <p className="font-mono text-[11px] text-ink-muted">
                /dashboard/workspaces/{slugify(name)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="font-mono text-xs text-ink-muted">
              Link projects (optional)
            </p>
            <ul className="max-h-48 divide-y divide-line overflow-y-auto border border-line">
              {(projects ?? []).map((project) => (
                <li key={project._id} className="px-3 py-2">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked.has(project._id)}
                      onChange={() =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (next.has(project._id)) next.delete(project._id);
                          else next.add(project._id);
                          return next;
                        })
                      }
                      className="accent-accent"
                    />
                    <span className="font-mono text-xs text-ink">
                      {project.name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[11px] text-ink-muted">
              Linked projects read every variable in this workspace. You can
              pull their existing duplicates in afterwards.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="border border-line px-3 py-2 font-mono text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSaving || name.trim().length === 0}
              className="inline-flex items-center gap-2 border border-accent px-3 py-2 font-mono text-xs text-accent disabled:opacity-40"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
