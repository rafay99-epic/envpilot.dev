import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface CurrentUserResponse {
  convexUserId: string;
  workosId: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

interface UserPreferences {
  [key: string]: unknown;
}

interface UserSession {
  _id: string;
  deviceName: string;
  lastUsed: number;
  createdAt: number;
  type: string;
}

export function useCurrentUser(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.me(),
    queryFn: () => api.get<CurrentUserResponse>("/api/users/me"),
    ...options,
  });
}

export function useUserPreferences(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.preferences(),
    queryFn: () => api.get<UserPreferences>("/api/users/me/preferences"),
    ...options,
  });
}

export function useUserSessions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.sessions(),
    queryFn: () =>
      api.get<{ sessions: UserSession[] }>("/api/users/me/sessions"),
    ...options,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string }) =>
      api.patch("/api/users/me", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.me() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    },
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch("/api/users/me/preferences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.users.preferences(),
      });
    },
  });
}
