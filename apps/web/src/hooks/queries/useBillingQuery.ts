import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface SubscriptionResponse {
  tier: string;
  subscription: {
    status: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
    trialEnd: number | null;
  } | null;
  hasStripeCustomer: boolean;
  canManageBilling: boolean;
}

export function useSubscription(
  orgId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.billing.subscription(orgId!),
    queryFn: () =>
      api.get<SubscriptionResponse>(
        `/api/billing/subscription?organizationId=${orgId}`
      ),
    enabled: !!orgId && (options?.enabled ?? true),
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (data: { organizationId: string; priceId?: string }) =>
      api.post<{ url: string }>("/api/billing/checkout", data),
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: (data: { organizationId: string }) =>
      api.post<{ url: string }>("/api/billing/portal", data),
  });
}
