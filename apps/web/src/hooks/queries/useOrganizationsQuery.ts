import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface OrganizationListItem {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  tier: string;
  createdAt: number;
  updatedAt: number;
}

interface OrganizationMember {
  _id: string;
  userId: string;
  role: string;
  user: {
    _id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
  };
  joinedAt: number;
}

interface PendingInvitation {
  _id: string;
  email: string;
  role: string;
  status: string;
  createdAt: number;
}

interface OrganizationMembersResponse {
  members: OrganizationMember[];
  pendingInvitations: PendingInvitation[];
}

export function useOrganizationsList(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.organizations.list(),
    queryFn: () =>
      api.get<{ organizations: OrganizationListItem[] }>("/api/organizations"),
    ...options,
  });
}

export function useOrganizationDetail(
  slug: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.organizations.detail(slug!),
    queryFn: () => api.get<OrganizationListItem>(`/api/organizations/${slug}`),
    enabled: !!slug && (options?.enabled ?? true),
  });
}

export function useOrganizationMembers(
  slug: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.organizations.members(slug!),
    queryFn: () =>
      api.get<OrganizationMembersResponse>(
        `/api/organizations/${slug}/members`
      ),
    enabled: !!slug && (options?.enabled ?? true),
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; slug: string; description?: string }) =>
      api.post("/api/organizations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.list(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useUpdateOrganization(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      api.patch(`/api/organizations/${slug}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.detail(slug),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.list(),
      });
    },
  });
}

export function useInviteMember(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      email: string;
      role: string;
      projectIds?: string[];
      projectRole?: string;
    }) => api.post(`/api/organizations/${slug}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.members(slug),
      });
    },
  });
}

export function useUpdateMemberRole(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/api/organizations/${slug}/members/${userId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.members(slug),
      });
    },
  });
}

export function useRemoveMember(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      api.del(`/api/organizations/${slug}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations.members(slug),
      });
    },
  });
}
