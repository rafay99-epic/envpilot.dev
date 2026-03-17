import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface VariableRequest {
  _id: string;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  status: "pending" | "approved" | "rejected" | "canceled";
  reviewReason?: string;
  requestedBy: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdVariableId?: string;
  createdAt: number;
  updatedAt: number;
  requester: { _id: string; email: string; name?: string } | null;
  reviewer: { _id: string; email: string; name?: string } | null;
}

export function useVariableRequestsList(
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.variableRequests.list(projectId!),
    queryFn: () =>
      api.get<{ requests: VariableRequest[] }>(
        `/api/variable-requests?projectId=${projectId}`
      ),
    enabled: !!projectId && (options?.enabled ?? true),
  });
}

export function useResolveVariableRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      action,
    }: {
      requestId: string;
      projectId: string;
      action: "approve" | "reject" | "cancel";
    }) =>
      api.patch<{ request: VariableRequest }>(
        `/api/variable-requests/${requestId}`,
        { action }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variableRequests.list(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.list(variables.projectId),
      });
    },
  });
}
