import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { AuthUser, Organization } from "@/lib/auth";

interface AuthMeResponse {
  user: AuthUser | null;
  organization: Organization | null;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    tier: string;
    role: string;
  }>;
  accessToken: string | null;
  impersonator?: {
    email: string;
    reason: string | null;
  };
}

export function useAuthQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => api.get<AuthMeResponse>("/api/auth/me"),
    ...options,
  });
}
