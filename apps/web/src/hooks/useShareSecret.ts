"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/**
 * React Query hooks for Secret Sharing.
 */

interface CreateShareParams {
  variableId: string;
  variableKey: string;
  organizationId: string;
  projectId: string;
  encryptedPayload: string;
  mode: "one_time" | "time_limited";
  ttlMs: number;
  hasPassphrase: boolean;
  recipientEmails: string[];
  clientKeyBase64Url: string;
}

interface CreateShareResponse {
  token: string;
  shareId: string;
}

interface VerifyEmailParams {
  token: string;
  email: string;
}

interface VerifyOtpParams {
  token: string;
  email: string;
  otp: string;
  otpHash: string;
}

interface VerifyOtpResponse {
  encryptedPayload: string;
  hasPassphrase: boolean;
}

/**
 * Create a new share link.
 */
export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateShareParams): Promise<CreateShareResponse> => {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create share");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares"] });
    },
  });
}

/**
 * Revoke a share link.
 */
export function useRevokeShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareId: string): Promise<void> => {
      const response = await fetch(`/api/shares/${shareId}/revoke`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to revoke share");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares"] });
    },
  });
}

/**
 * Verify email for a share (Step 1 of viewer flow).
 */
export function useVerifyShareEmail() {
  return useMutation({
    mutationFn: async (params: VerifyEmailParams): Promise<{ success: boolean }> => {
      const response = await fetch(
        `/api/shares/${params.token}/verify-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: params.email }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to verify email");
      }

      return response.json();
    },
  });
}

/**
 * Verify OTP and retrieve the encrypted secret (Step 2 of viewer flow).
 */
export function useVerifyShareOtp() {
  return useMutation({
    mutationFn: async (params: VerifyOtpParams): Promise<VerifyOtpResponse> => {
      const response = await fetch(
        `/api/shares/${params.token}/verify-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: params.email,
            otp: params.otp,
            otpHash: params.otpHash,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to verify OTP");
      }

      return response.json();
    },
  });
}
