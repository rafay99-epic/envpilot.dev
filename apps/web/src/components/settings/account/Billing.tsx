"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ExternalLink, Receipt } from "lucide-react";
import {
  DangerRow,
  SettingsField,
  SettingsRow,
  SettingsSection,
} from "@envpilot/ui";
import {
  TerminalBadge,
  TerminalButton,
  TerminalSelect,
} from "@/components/dashboard/terminal-ui";
import { TierBadge } from "@/components/tier/TierBadge";
import {
  useSubscription,
  useCreatePortalSession,
} from "@/hooks/queries/useBillingQuery";
import { usePaymentsEnabled } from "@/hooks/usePaymentsEnabled";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDateWith } from "@/lib/format";

const PERIOD_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
};

function getStatusColor(status: string): "green" | "amber" | "red" {
  switch (status) {
    case "active":
      return "green";
    case "canceled":
    case "canceling":
      return "amber";
    case "past_due":
    case "revoked":
    case "unpaid":
      return "red";
    default:
      return "amber";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "canceled":
      return "Canceled";
    case "revoked":
      return "Expired";
    case "past_due":
      return "Past Due";
    case "trialing":
      return "Trial";
    case "unpaid":
      return "Unpaid";
    case "incomplete":
      return "Incomplete";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

const CANCEL_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "switched_service", label: "Switched to another service" },
  { value: "unused", label: "Not using it enough" },
  { value: "customer_service", label: "Customer service issues" },
  { value: "low_quality", label: "Quality did not meet expectations" },
  { value: "too_complex", label: "Too complex to use" },
  { value: "other", label: "Other" },
];

const QUICK_LINKS = [
  { href: "/faq#plans-billing", label: "Billing FAQ" },
  { href: "/terms#billing", label: "Terms of service — billing" },
  { href: "/privacy", label: "Privacy policy" },
];

export function BillingSettings({
  organizationId,
  alreadyProNotice,
}: {
  organizationId: string | undefined;
  alreadyProNotice: boolean;
}) {
  const { data: subscription, isLoading } = useSubscription(organizationId);
  const portalMutation = useCreatePortalSession();
  const paymentsEnabled = usePaymentsEnabled();
  const timeZone = useTimeZone();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelComment, setCancelComment] = useState("");
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const formatDate = (timestamp: number) =>
    formatDateWith(timestamp, PERIOD_DATE_OPTIONS, timeZone);

  async function handleManageBilling() {
    if (!organizationId) return;
    try {
      const data = await portalMutation.mutateAsync({ organizationId });
      if (data.portalUrl) window.open(data.portalUrl, "_blank", "noopener");
    } catch {
      // Error is handled by mutation state
    }
  }

  async function handleConfirmCancel() {
    if (!organizationId) return;
    // Feedback is required before a cancellation goes through — the reason
    // lands on the Polar subscription and is what the team reviews.
    if (!cancelReason) {
      setCancelMessage({
        type: "error",
        text: "Please select a reason for canceling — this feedback is required.",
      });
      return;
    }
    setIsCanceling(true);
    setCancelMessage(null);

    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          reason: cancelReason,
          comment: cancelComment || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel subscription");
      }

      setCancelMessage({
        type: "success",
        text: "Subscription cancellation scheduled. Your access continues until the end of the current billing period.",
      });
      setShowCancelConfirm(false);
      setCancelReason("");
      setCancelComment("");
    } catch (err) {
      setCancelMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to cancel subscription",
      });
    } finally {
      setIsCanceling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3 py-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-6 animate-pulse rounded-panel bg-surface-raised"
          />
        ))}
      </div>
    );
  }

  const sub = subscription?.subscription;
  const hasBillingCustomer = subscription?.hasBillingCustomer ?? false;
  const isActive = sub?.status === "active";
  const isRevoked = sub?.status === "revoked" || sub?.status === "canceled";
  const isCancelingAtEnd = sub?.cancelAtPeriodEnd ?? false;

  return (
    <div>
      {alreadyProNotice && (
        <p className="flex items-center gap-2 pt-2 text-[13px] text-accent">
          <Check className="h-4 w-4 shrink-0" />
          You&apos;re already on the Pro plan. Your subscription is active.
        </p>
      )}

      <SettingsSection
        title="Subscription"
        description="Your current plan and billing details"
      >
        <SettingsRow
          label="Plan"
          control={
            <div className="flex items-center gap-2">
              <TierBadge tier={subscription?.tier ?? "free"} />
              {sub ? (
                <TerminalBadge color={getStatusColor(sub.status)}>
                  {getStatusLabel(sub.status)}
                </TerminalBadge>
              ) : (
                <TerminalBadge color="green">Free</TerminalBadge>
              )}
            </div>
          }
        />

        {sub ? (
          <>
            <SettingsRow
              label={isRevoked ? "Last billing period" : "Current period"}
              control={
                <span className="text-[13px] text-ink-muted">
                  {formatDate(sub.currentPeriodStart)} &mdash;{" "}
                  {formatDate(sub.currentPeriodEnd)}
                </span>
              }
            />

            {isRevoked ? (
              <div className="space-y-3">
                <p className="flex items-start gap-2 text-[13px] text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Your subscription has ended. You are now on the Free plan.
                </p>
                <p className="text-[13px] text-ink-muted">
                  {paymentsEnabled
                    ? "Resubscribe to unlock Pro features again."
                    : "Subscriptions are currently unavailable."}
                </p>
                {paymentsEnabled && (
                  <TerminalButton
                    onClick={() => {
                      window.location.href = "/api/checkout?tier=pro";
                    }}
                  >
                    Resubscribe to Pro
                    <ExternalLink className="h-3 w-3" />
                  </TerminalButton>
                )}
              </div>
            ) : isCancelingAtEnd ? (
              <p className="flex items-start gap-2 text-[13px] text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Cancels at end of period ({formatDate(sub.currentPeriodEnd)}).
                You retain Pro access until then.
              </p>
            ) : isActive ? (
              <SettingsRow
                label="Next billing date"
                control={
                  <span className="text-[13px] text-ink-muted">
                    {formatDate(sub.currentPeriodEnd)}
                  </span>
                }
              />
            ) : sub.status === "past_due" ? (
              <p className="flex items-start gap-2 text-[13px] text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Payment failed. Please update your payment method to avoid
                losing access.
              </p>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-ink-muted">
              {paymentsEnabled
                ? "You're on the Free plan. Upgrade to unlock more features."
                : "You're on the Free plan."}
            </p>
            {paymentsEnabled && (
              <TerminalButton
                onClick={() => {
                  window.location.href = "/api/checkout?tier=pro";
                }}
              >
                Upgrade to Pro
                <ExternalLink className="h-3 w-3" />
              </TerminalButton>
            )}
          </div>
        )}

        {cancelMessage && (
          <p
            className={`text-[13px] ${
              cancelMessage.type === "success" ? "text-accent" : "text-danger"
            }`}
          >
            {cancelMessage.text}
          </p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Billing actions"
        description="Manage your payment methods, invoices, and subscription"
      >
        {hasBillingCustomer && (
          <>
            <SettingsRow
              label="Manage billing"
              description="Update payment methods and billing details"
              control={
                <TerminalButton
                  onClick={handleManageBilling}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? "Opening..." : "Open portal"}
                  {!portalMutation.isPending && (
                    <ExternalLink className="h-3 w-3" />
                  )}
                </TerminalButton>
              }
            />

            <SettingsRow
              label="Invoices & receipts"
              description="Access your billing history and download receipts"
              control={
                <TerminalButton
                  variant="secondary"
                  onClick={handleManageBilling}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? "Opening..." : "View invoices"}
                  {!portalMutation.isPending && <Receipt className="h-3 w-3" />}
                </TerminalButton>
              }
            />
          </>
        )}

        {isActive && !isCancelingAtEnd && (
          <DangerRow
            title="Cancel subscription"
            description="Cancel at the end of your current billing period."
            action={
              <TerminalButton
                variant="danger"
                onClick={() => setShowCancelConfirm(true)}
              >
                Cancel plan
              </TerminalButton>
            }
          />
        )}

        {!hasBillingCustomer && !isActive && (
          <p className="text-[13px] text-ink-subtle">
            No billing actions available on the Free plan.
          </p>
        )}

        {portalMutation.isError && (
          <p className="text-[13px] text-danger">
            {portalMutation.error instanceof Error
              ? portalMutation.error.message
              : "Failed to open billing portal"}
          </p>
        )}
      </SettingsSection>

      {showCancelConfirm && sub && (
        <SettingsSection
          title="Confirm cancellation"
          description="Cancelling schedules the end of your Pro access — it does not remove anything you have stored."
          tone="danger"
        >
          <ul className="space-y-1.5">
            {[
              `Your Pro access continues until ${formatDate(sub.currentPeriodEnd)}`,
              "After that, a 7-day grace period begins",
              "No refund for the current billing period",
              "Your data is never deleted",
            ].map((line) => (
              <li
                key={line}
                className="flex gap-2 text-[13px] leading-relaxed text-ink-muted"
              >
                <span aria-hidden className="font-mono text-warning">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>

          <SettingsField
            label="Reason for canceling (required)"
            htmlFor="cancelReason"
          >
            <TerminalSelect
              id="cancelReason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
              className="w-full"
            >
              <option value="">Select a reason (required)</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </TerminalSelect>
          </SettingsField>

          <SettingsField
            label="Additional feedback (optional)"
            htmlFor="cancelComment"
          >
            <textarea
              id="cancelComment"
              value={cancelComment}
              onChange={(e) => setCancelComment(e.target.value)}
              rows={3}
              placeholder="Tell us how we can improve..."
              className="w-full rounded-panel border border-line bg-surface-raised px-3 py-2 text-sm text-ink transition-colors placeholder:text-ink-faint focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none"
            />
          </SettingsField>

          <div className="flex items-center justify-end gap-3">
            <TerminalButton
              variant="secondary"
              onClick={() => {
                setShowCancelConfirm(false);
                setCancelReason("");
                setCancelComment("");
              }}
              disabled={isCanceling}
            >
              Go back
            </TerminalButton>
            <TerminalButton
              variant="danger"
              onClick={handleConfirmCancel}
              disabled={isCanceling || !cancelReason}
              title={
                !cancelReason ? "Select a cancellation reason first" : undefined
              }
            >
              {isCanceling ? "Canceling..." : "Confirm cancellation"}
            </TerminalButton>
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Quick links">
        <ul className="-my-1">
          {QUICK_LINKS.map((link) => (
            <li key={link.href} className="border-t border-line first:border-0">
              <Link
                href={link.href}
                className="flex items-center gap-2.5 py-3 text-[14px] text-ink-muted transition-colors hover:text-ink"
              >
                <ExternalLink className="h-3.5 w-3.5 text-accent" />
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
