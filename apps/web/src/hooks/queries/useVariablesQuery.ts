import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface Variable {
  _id: string;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  vaultRef?: string;
  permission?: "read" | "write" | "admin" | null;
  rotationFrequencyDays?: number;
  expiresAt?: number;
  rotationStatus?: "active" | "expiring_soon" | "expired";
  tagIds?: string[];
}

interface VersionRecord {
  _id: string;
  version: number;
  description?: string;
  environments: string[];
  changeReason?: string;
  createdAt: number;
  changedByUser: { name?: string; email: string } | null;
}

export function useVariablesList(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.variables.list(projectId!),
    queryFn: () =>
      api.get<{ variables: Variable[] }>(
        `/api/variables?projectId=${projectId}`
      ),
    enabled: !!projectId && (options?.enabled ?? true),
  });
}

export function useVariableDetail(
  id: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.variables.detail(id!),
    queryFn: () => api.get<{ variable: Variable }>(`/api/variables/${id}`),
    enabled: !!id && (options?.enabled ?? true),
  });
}

export function useVariableHistory(
  id: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.variables.history(id!),
    queryFn: () =>
      api.get<{ history: VersionRecord[] }>(`/api/variables/${id}/history`),
    enabled: !!id && (options?.enabled ?? true),
  });
}

export function useCreateVariable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      key: string;
      value: string;
      description?: string;
      environments: string[];
      projectId: string;
      isSensitive: boolean;
      rotationFrequencyDays?: number;
      tagIds?: string[];
    }) =>
      api.post<{
        variable?: Variable;
        requested?: boolean;
        requestId?: string;
        message?: string;
      }>("/api/variables", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.list(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.variableRequests.list(variables.projectId),
      });
    },
  });
}

export function useUpdateVariable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      variableId,
      projectId,
      ...data
    }: {
      variableId: string;
      projectId: string;
      value?: string;
      description?: string;
      environments?: string[];
      isSensitive?: boolean;
      changeReason?: string;
      rotationFrequencyDays?: number;
      tagIds?: string[];
    }) =>
      api.patch<{ variable: Variable }>(`/api/variables/${variableId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.list(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.detail(variables.variableId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.history(variables.variableId),
      });
    },
  });
}

export function useDeleteVariable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ variableId }: { variableId: string; projectId: string }) =>
      api.del<{ success: boolean }>(`/api/variables/${variableId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.list(variables.projectId),
      });
    },
  });
}

export function useBulkDeleteVariables() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { variableIds: string[]; projectId: string }) =>
      api.post<{ success: boolean; deletedCount: number }>(
        "/api/variables/bulk-delete",
        data
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.list(variables.projectId),
      });
    },
  });
}

export function useRollbackVariable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      variableId,
      targetVersion,
    }: {
      variableId: string;
      projectId: string;
      targetVersion: number;
    }) =>
      api.post<{ variable: Variable; valueRestored: boolean }>(
        `/api/variables/${variableId}/rollback`,
        { targetVersion }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.list(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.history(variables.variableId),
      });
    },
  });
}
