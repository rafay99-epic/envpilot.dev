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
import { Plus, Clock, ChevronRight, Star } from "lucide-react";

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
        <p className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> envpilot project list
        </p>
        <p className="mt-2 text-sm text-zinc-400">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Organize your environment variables by project
          </p>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 0 && (
            <button
              onClick={() => setShowFavoritesFirst(!showFavoritesFirst)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showFavoritesFirst
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-zinc-700/50 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
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
        </div>
      </div>

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
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 transition-all hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/5"
    >
      <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[#ef5350]/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/80" />
        <div className="h-2.5 w-2.5 rounded-full bg-[#22c55e]/80" />
        <span className="ml-2 truncate text-xs text-zinc-500">
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
                  ? "fill-amber-400 text-amber-400"
                  : "text-zinc-600 hover:text-amber-400"
              }`}
            />
          </button>
        )}
        <ChevronRight
          className={`${onToggleFavorite ? "" : "ml-auto"} h-3 w-3 text-zinc-600 transition-colors group-hover:text-green-400`}
        />
      </div>
      <div className="flex-1 p-4">
        <h3 className="font-mono text-sm font-semibold text-zinc-100 group-hover:text-green-400">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-1 truncate text-xs text-zinc-500">
            {project.description}
          </p>
        )}
        <div className="mt-3 flex items-center text-xs text-zinc-600">
          <Clock className="mr-1.5 h-3 w-3" />
          Created {new Date(project.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
  );
}
