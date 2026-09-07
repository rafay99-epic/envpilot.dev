"use client";

import Link from "next/link";
import { PageHeader } from "@envpilot/ui";
import { ProjectIcon } from "@/components/ui";
import { DEFAULT_PROJECT_COLOR } from "@/constants/project";
import type { useProjectBySlug } from "@/hooks";

type Project = NonNullable<ReturnType<typeof useProjectBySlug>>;

// Project title block plus the Members / Trash links.
export function ProjectDetailHeader({
  project,
  canSeeTrash,
}: {
  project: Project;
  canSeeTrash: boolean;
}) {
  return (
    <PageHeader
      // The project's OWN icon and colour, not a generic folder glyph —
      // this square is how a project is recognised across the dashboard.
      leading={
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
        >
          <ProjectIcon icon={project.icon} size={20} />
        </div>
      }
      title={project.name}
      description={project.description || undefined}
      actions={
        <>
          <Link
            href={`/dashboard/projects/${project.slug}/members`}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Members
          </Link>
          {canSeeTrash && (
            <Link
              href={`/dashboard/projects/${project.slug}/trash`}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Trash
            </Link>
          )}
        </>
      }
    />
  );
}
