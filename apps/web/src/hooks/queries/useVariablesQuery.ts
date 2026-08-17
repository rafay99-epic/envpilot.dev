"use client";

import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Variable writes, straight to Convex.
 *
 * These used to post to /api/variables* through React Query. Every one of
 * those routes was a passthrough: read the AuthKit session, then call the
 * exact Convex function called here. The browser already holds an
 * authenticated Convex socket, so the HTTP hop re-derived an identity it
 * already had.
 *
 * The React Query layer went with it. Its `onSuccess` handlers invalidated
 * `queryKeys.variables.*`, and nothing read those keys: the lists are
 * `usePaginatedQuery`/`useQuery` against Convex, which push on write. The
 * invalidation was maintaining a cache with no readers.
 *
 * The hooks keep the `mutateAsync` shape so call sites did not have to change
 * their control flow.
 */

type MutationLike<TArgs, TResult> = {
  mutateAsync: (args: TArgs) => Promise<TResult>;
};

export function useCreateVariable(): MutationLike<
  {
    key: string;
    value: string;
    description?: string;
    environments: string[];
    projectId: string;
    isSensitive: boolean;
    rotationFrequencyDays?: number;
    tagIds?: string[];
  },
  { requested: boolean }
> {
  const createWithValue = useAction(
    api.features.variables.values.createWithValue
  );

  return {
    mutateAsync: async ({ projectId, tagIds, ...data }) => {
      await createWithValue({
        ...data,
        projectId: projectId as Id<"projects">,
        tagIds: tagIds as Id<"variableTags">[] | undefined,
      });
      // Direct creation only. The request-for-approval path is a separate
      // flow (variables/requests); the old route never returned true here
      // either, so callers see the same branch they always did.
      return { requested: false };
    },
  };
}

export function useUpdateVariable(): MutationLike<
  {
    variableId: string;
    projectId: string;
    value?: string;
    description?: string;
    environments?: string[];
    isSensitive?: boolean;
    changeReason?: string;
    rotationFrequencyDays?: number;
    tagIds?: string[];
  },
  void
> {
  const updateWithValue = useAction(
    api.features.variables.values.updateWithValue
  );

  return {
    mutateAsync: async ({
      variableId,
      projectId: _projectId,
      tagIds,
      ...data
    }) => {
      await updateWithValue({
        ...data,
        variableId: variableId as Id<"environmentVariables">,
        tagIds: tagIds as Id<"variableTags">[] | undefined,
      });
    },
  };
}

export function useDeleteVariable(): MutationLike<
  { variableId: string; projectId: string },
  void
> {
  const remove = useMutation(api.features.variables.mutations.remove);

  return {
    mutateAsync: async ({ variableId }) => {
      await remove({ variableId: variableId as Id<"environmentVariables"> });
    },
  };
}

export function useBulkDeleteVariables(): MutationLike<
  { variableIds: string[]; projectId: string },
  { deletedCount: number }
> {
  const bulkDelete = useMutation(api.features.variables.mutations.bulkDelete);

  return {
    mutateAsync: ({ variableIds }) =>
      bulkDelete({
        variableIds: variableIds as Id<"environmentVariables">[],
      }),
  };
}

export function useRollbackVariable(): MutationLike<
  { variableId: string; projectId: string; targetVersion: number },
  { valueRestored: boolean }
> {
  const rollback = useMutation(api.features.variables.mutations.rollback);

  return {
    mutateAsync: ({ variableId, targetVersion }) =>
      rollback({
        variableId: variableId as Id<"environmentVariables">,
        targetVersion,
      }),
  };
}
