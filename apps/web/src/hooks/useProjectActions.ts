"use client";

import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useCreateProject() {
  const create = useMutation(api.features.projects.mutations.create);

  return async (input: {
    name: string;
    slug: string;
    description?: string;
    organizationId: string;
    icon?: string;
    color?: string;
  }) =>
    create({
      ...input,
      organizationId: input.organizationId as Id<"organizations">,
    });
}

export function useUpdateProject() {
  const update = useMutation(api.features.projects.mutations.update);
  return (input: {
    projectId: string;
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    vscodeAutoUnsyncOnClose?: boolean;
  }) =>
    update({
      ...input,
      projectId: input.projectId as Id<"projects">,
    });
}

export function useDeleteProject() {
  const remove = useMutation(api.features.projects.mutations.remove);
  return (projectId: string) =>
    remove({ projectId: projectId as Id<"projects"> });
}

export function useMoveProject() {
  const move = useMutation(api.features.projects.mutations.move);
  return (input: { projectId: string; targetOrganizationId: string }) =>
    move({
      projectId: input.projectId as Id<"projects">,
      targetOrganizationId: input.targetOrganizationId as Id<"organizations">,
    });
}
