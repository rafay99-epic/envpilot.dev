"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { useRecentProjects } from "@/hooks";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";

interface RecentProject {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: number;
  variableCount: number;
}

// The `envpilot project list --recent` terminal window.
export function RecentProjectsPanel({
  projects,
  isLoading,
  canCreateProject,
}: {
  projects: ReturnType<typeof useRecentProjects>["projects"];
  isLoading: boolean;
  canCreateProject: boolean;
}) {
  return (
    <TerminalWindow
      title="recent-projects"
      cmd="envpilot project list --recent"
      action={{ label: "View all", href: "/dashboard/projects" }}
    >
      {isLoading ? (
        <TerminalLoading />
      ) : projects.length === 0 ? (
        <TerminalEmptyState
          command="envpilot project list"
          message="No projects found."
          action={
            canCreateProject
              ? {
                  label: "Create your first project",
                  href: "/dashboard/projects/new",
                }
              : undefined
          }
        />
      ) : (
        <AnimatedList className="divide-y divide-line">
          {projects.map((project: RecentProject) => (
            <ProjectRow key={project._id} project={project} />
          ))}
        </AnimatedList>
      )}
    </TerminalWindow>
  );
}

function ProjectRow({ project }: { project: RecentProject }) {
  return (
    <Link
      href={`/dashboard/projects/${project.slug}`}
      className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent-soft"
    >
      <div className="flex items-center gap-3">
        <span className="text-accent font-mono text-xs">{">"}</span>
        <div>
          <p className="text-sm font-medium font-mono text-ink">
            {project.name}
          </p>
          {project.description && (
            <p className="mt-0.5 text-xs text-ink-subtle truncate max-w-xs">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TerminalBadge color="zinc">
          {project.variableCount} {project.variableCount === 1 ? "var" : "vars"}
        </TerminalBadge>
        <ChevronRight className="h-4 w-4 text-ink-faint" />
      </div>
    </Link>
  );
}
