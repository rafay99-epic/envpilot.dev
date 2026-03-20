import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export interface Tag {
  _id: string;
  organizationId: string;
  name: string;
  color: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export function useOrganizationTags(
  organizationId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.tags.list(organizationId!),
    queryFn: () =>
      api.get<{ tags: Tag[] }>(`/api/tags?organizationId=${organizationId}`),
    enabled: !!organizationId && (options?.enabled ?? true),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      organizationId: string;
      name: string;
      color: string;
    }) => api.post<{ tag: Tag }>("/api/tags", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.list(variables.organizationId),
      });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tagId,
      organizationId,
      ...data
    }: {
      tagId: string;
      organizationId: string;
      name?: string;
      color?: string;
    }) => api.patch<{ tag: Tag }>(`/api/tags/${tagId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.list(variables.organizationId),
      });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId }: { tagId: string; organizationId: string }) =>
      api.del<{ deleted: boolean; variablesAffected: number }>(
        `/api/tags/${tagId}`
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tags.list(variables.organizationId),
      });
      // Also invalidate variables since tags may have been stripped
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.all,
      });
    },
  });
}
