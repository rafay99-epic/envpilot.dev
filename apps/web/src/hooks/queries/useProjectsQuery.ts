import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface Project {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  organizationId: string;
  createdAt: number;
  updatedAt: number;
}

export function useProjectsList(
  orgId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.projects.list(orgId!),
    queryFn: () =>
      api.get<{ projects: Project[] }>(`/api/projects?organizationId=${orgId}`),
    enabled: !!orgId && (options?.enabled ?? true),
  });
}

export function useProjectBySlug(
  orgId: string | undefined,
  slug: string | undefined
) {
  return useQuery({
    queryKey: [...queryKeys.projects.list(orgId!), "bySlug", slug] as const,
    queryFn: async () => {
      const data = await api.get<{ projects: Project[] }>(
        `/api/projects?organizationId=${orgId}`
      );
      const project = data.projects?.find((p) => p.slug === slug);
      if (!project) throw new Error("Project not found");
      return project;
    },
    enabled: !!orgId && !!slug,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      color?: string;
      organizationId: string;
    }) => api.post<{ project: Project }>("/api/projects", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.list(variables.organizationId),
      });
    },
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name?: string;
      description?: string;
      icon?: string;
      color?: string;
    }) => api.patch<{ project: Project }>(`/api/projects/${projectId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(projectId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => api.del(`/api/projects/${projectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
