"use client";

import Link from "next/link";
import { useProjects } from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import type { Id } from "@convex/_generated/dataModel";

export default function ProjectsPage() {
  const { hasPermission, organization } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { projects, isLoading } = useProjects(activeOrganizationId);
  const canCreateProject = hasPermission(PERMISSIONS.PROJECT_CREATE);

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          No active organization
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Select or create an organization to manage projects.
        </p>
        <Link
          href="/organizations"
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Manage Organizations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Projects
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Organize your environment variables by project
          </p>
        </div>
        {canCreateProject && (
          <Link
            href="/dashboard/projects/new"
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Project
          </Link>
        )}
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState canCreate={canCreateProject} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project._id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg
          className="h-6 w-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        No projects yet
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Create your first project to start managing environment variables.
      </p>
      {canCreate && (
        <Link
          href="/dashboard/projects/new"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Project
        </Link>
      )}
    </div>
  );
}

interface Project {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  createdAt: number;
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/dashboard/projects/${project.slug}`}
      className="group rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="flex items-start gap-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
          style={{
            backgroundColor: project.color || "#f4f4f5",
          }}
        >
          {project.icon || "📁"}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-200">
            {project.name}
          </h3>
          {project.description && (
            <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center text-xs text-zinc-500 dark:text-zinc-400">
        <svg
          className="mr-1.5 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Created {new Date(project.createdAt).toLocaleDateString()}
      </div>
    </Link>
  );
}
