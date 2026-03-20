"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";

/**
 * React Query hooks for Secret Sharing.
 *
 * Follows the existing codebase pattern:
 * - Errors are thrown as ApiError-like Error instances with server messages
 * - Sentry captures unexpected (non-4xx) failures
 * - onSuccess invalidates relevant query keys
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
 * Parse API response, extract error, report unexpected failures to Sentry.
 */
async function handleShareResponse<T>(
  response: Response,
  action: string
): Promise<T> {
  if (response.ok) {
    return response.json();
  }

  let errorMessage = `Failed to ${action}`;
  try {
    const data = await response.json();
    if (data.error) errorMessage = data.error;
  } catch {
    // Response wasn't JSON — use status text
    errorMessage = response.statusText || errorMessage;
  }

  // Report server errors (5xx) to Sentry — 4xx are expected user errors
  if (response.status >= 500) {
    Sentry.captureException(new Error(errorMessage), {
      tags: { source: "share-hook", action },
      extra: { status: response.status },
    });
  }

  throw new Error(errorMessage);
}

/**
 * Create a new share link.
 */
export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["shares", "create"],
    mutationFn: async (
      params: CreateShareParams
    ): Promise<CreateShareResponse> => {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      return handleShareResponse<CreateShareResponse>(response, "create share");
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
    mutationKey: ["shares", "revoke"],
    mutationFn: async (shareId: string): Promise<void> => {
      const response = await fetch(`/api/shares/${shareId}/revoke`, {
        method: "DELETE",
      });

      if (!response.ok) {
        await handleShareResponse<never>(response, "revoke share");
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
    mutationKey: ["shares", "verify-email"],
    mutationFn: async (
      params: VerifyEmailParams
    ): Promise<{ success: boolean }> => {
      const response = await fetch(`/api/shares/${params.token}/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: params.email }),
      });

      return handleShareResponse<{ success: boolean }>(
        response,
        "verify email"
      );
    },
  });
}

/**
 * Verify OTP and retrieve the encrypted secret (Step 2 of viewer flow).
 */
export function useVerifyShareOtp() {
  return useMutation({
    mutationKey: ["shares", "verify-otp"],
    mutationFn: async (params: VerifyOtpParams): Promise<VerifyOtpResponse> => {
      const response = await fetch(`/api/shares/${params.token}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: params.email,
          otp: params.otp,
        }),
      });

      return handleShareResponse<VerifyOtpResponse>(response, "verify code");
    },
  });
}
