"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useProjects,
  useConvexUser,
  usePagination,
  useFavoriteProjects,
  useToggleFavorite,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalButtonLink,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedGrid } from "@/components/dashboard/animated-list";
import { ChevronRight, Clock, FolderGit2, Plus, Star } from "lucide-react";
import { PageHeader } from "@envpilot/ui";

export default function ProjectsPage() {
  const { canDo, organization, user } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { convexUserId } = useConvexUser(user?.id);
  const { projects, isLoading } = useProjects(
    activeOrganizationId,
    convexUserId
  );
  const canCreateProject = canDo("org:create_project");

  // Favorites
  const { favoriteProjectIds } = useFavoriteProjects(convexUserId);
  const { toggle: toggleFavorite } = useToggleFavorite();
  const [showFavoritesFirst, setShowFavoritesFirst] = useState(true);

  // Sort favorites first if enabled
  const sortedProjects = showFavoritesFirst
    ? [...projects].sort((a, b) => {
        const aFav = favoriteProjectIds.has(a._id) ? 1 : 0;
        const bFav = favoriteProjectIds.has(b._id) ? 1 : 0;
        return bFav - aFav;
      })
    : projects;

  const pagination = usePagination(sortedProjects, { pageSize: 9 });

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-ink-subtle">
          <span className="text-accent">$</span> envpilot project list
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Select or create an organization to manage projects.
        </p>
        <TerminalButtonLink href="/organizations" className="mt-6">
          Manage Organizations
        </TerminalButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={FolderGit2}
        title="Projects"
        description="Organize your environment variables by project"
        actions={
          <>
            {projects.length > 0 && (
              <button
                onClick={() => setShowFavoritesFirst(!showFavoritesFirst)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  showFavoritesFirst
                    ? "border-warning-line bg-warning-soft text-warning"
                    : "border-line text-ink-subtle hover:border-line-strong hover:text-ink-muted"
                }`}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={showFavoritesFirst ? "currentColor" : "none"}
                />
                Favorites first
              </button>
            )}
            {canCreateProject && (
              <TerminalButtonLink href="/dashboard/projects/new">
                <Plus className="h-4 w-4" />
                New Project
              </TerminalButtonLink>
            )}
          </>
        }
      />

      {/* Projects Grid */}
      {isLoading ? (
        <TerminalLoading />
      ) : projects.length === 0 ? (
        <TerminalWindow title="projects">
          <TerminalEmptyState
            command="envpilot project list"
            message="No projects found. Create your first project to start managing environment variables."
            action={
              canCreateProject
                ? { label: "Create Project", href: "/dashboard/projects/new" }
                : undefined
            }
          />
        </TerminalWindow>
      ) : (
        <>
          <AnimatedGrid
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            pageKey={pagination.currentPage}
          >
            {pagination.pageItems.map((project) => (
              <ProjectCard
                key={project._id}
                project={project}
                isFavorite={favoriteProjectIds.has(project._id)}
                onToggleFavorite={
                  convexUserId
                    ? () =>
                        toggleFavorite(
                          convexUserId,
                          project._id as Id<"projects">
                        )
                    : undefined
                }
              />
            ))}
          </AnimatedGrid>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
            onGoToPage={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </>
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

function ProjectCard({
  project,
  isFavorite = false,
  onToggleFavorite,
}: {
  project: Project;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <Link
      href={`/dashboard/projects/${project.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface/90 transition-all hover:border-accent-line hover:shadow-lg hover:shadow-accent-line"
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-danger/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-warning/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-accent/80" />
        <span className="ml-2 truncate text-xs text-ink-subtle">
          {project.slug}
        </span>
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="ml-auto p-0.5 transition-colors"
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                isFavorite
                  ? "fill-warning text-warning"
                  : "text-ink-faint hover:text-warning"
              }`}
            />
          </button>
        )}
        <ChevronRight
          className={`${onToggleFavorite ? "" : "ml-auto"} h-3 w-3 text-ink-faint transition-colors group-hover:text-accent`}
        />
      </div>
      <div className="flex-1 p-4">
        <h3 className="font-mono text-sm font-semibold text-ink group-hover:text-accent">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-1 truncate text-xs text-ink-subtle">
            {project.description}
          </p>
        )}
        <div className="mt-3 flex items-center text-xs text-ink-faint">
          <Clock className="mr-1.5 h-3 w-3" />
          Created {new Date(project.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
  );
}
