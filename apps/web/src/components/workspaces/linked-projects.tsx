"use client";

import Link from "next/link";
import { Loader2, Plus, X } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";

export type LinkedProject = {
  membershipId: Id<"workspaceProjects">;
  projectId: Id<"projects">;
  name: string;
  slug: string;
  environments: string[] | undefined;
  inheritedCount: number;
};

interface LinkedProjectsProps {
  members: LinkedProject[];
  candidates: { _id: Id<"projects">; name: string }[];
  pendingProjectId: string;
  isAdding: boolean;
  onPendingChange: (projectId: string) => void;
  onAdd: () => void;
  onRemove: (member: LinkedProject) => void;
}

/** The projects reading a workspace, plus the picker to link another. */
export function LinkedProjects({
  members,
  candidates,
  pendingProjectId,
  isAdding,
  onPendingChange,
  onAdd,
  onRemove,
}: LinkedProjectsProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-mono text-sm text-ink">Linked projects</h2>
        <span className="font-mono text-xs text-ink-muted">
          {members.length} linked
        </span>
      </div>

      {members.length === 0 ? (
        <p className="border border-line px-4 py-6 text-sm text-ink-muted">
          No project reads these values yet. Link one below and every variable
          above appears on its variables page, read only.
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {members.map((member) => (
            <li
              key={member.membershipId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <Link
                href={`/dashboard/projects/${member.slug}`}
                className="text-sm text-ink hover:text-accent"
              >
                {member.name}
              </Link>
              <span className="flex items-center gap-4 font-mono text-xs text-ink-muted">
                <span>
                  {member.environments
                    ? member.environments.join(" ")
                    : "all environments"}
                </span>
                <span>inherits {member.inheritedCount}</span>
                <button
                  type="button"
                  onClick={() => onRemove(member)}
                  className="text-ink-muted hover:text-danger"
                  aria-label={`Remove ${member.name} from workspace`}
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pendingProjectId}
            onChange={(event) => onPendingChange(event.target.value)}
            aria-label="Project to link"
            className="border border-line bg-surface px-3 py-2 font-mono text-xs text-ink"
          >
            <option value="">Link a project…</option>
            {candidates.map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAdd}
            disabled={!pendingProjectId || isAdding}
            className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-xs text-ink-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {isAdding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Link
          </button>
        </div>
      )}
    </section>
  );
}
