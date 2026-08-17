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

/**
 * Create a project and provision a template's variables in one call.
 *
 * Returns as soon as the project row exists; the variables are written to the
 * vault by a workflow and land in one transaction. Watch progress with
 * `useBulkJob(projectId)`.
 *
 * Note there is no `value` on a spec: the backend derives the placeholder from
 * `defaultValue` / `placeholder`, so no secret can be handed to a workflow
 * (whose arguments are journaled to the database).
 */
export function useCreateProjectFromTemplate() {
  const start = useMutation(
    api.features.projects.fromTemplate.startFromTemplate
  );

  return (input: {
    name: string;
    slug: string;
    description?: string;
    organizationId: string;
    icon?: string;
    color?: string;
    variables: {
      key: string;
      description?: string;
      defaultValue?: string;
      placeholder?: string;
      environments: string[];
      isSensitive?: boolean;
    }[];
  }) =>
    start({
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
