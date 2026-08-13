"use client";

import { useState } from "react";
import { X, Copy, Check, Loader2, Mail, AlertTriangle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import {
  generateClientKey,
  clientKeyToBase64Url,
  encryptForShare,
} from "@/lib/share-crypto";
import { useCreateShare } from "@/hooks/useShareSecret";
import { useAuth } from "@/hooks/use-auth";

type ShareMode = "one_time" | "time_limited";

const TTL_OPTIONS = [
  { label: "1h", ms: 3_600_000 },
  { label: "6h", ms: 21_600_000 },
  { label: "24h", ms: 86_400_000 },
  { label: "7d", ms: 604_800_000 },
];

export interface ShareLinkFormProps {
  organizationId: string;
  projectId: string;
  /**
   * Produce the plaintext payload to encrypt (e.g. `KEY=value` for a variable
   * or the serialized account share). Return `null` to abort silently; throw
   * to surface a specific error message in the form.
   */
  buildPayload: () => Promise<string | null>;
  /**
   * Resource-specific fields merged into the POST /api/shares body —
   * `{ variableId, variableKey }` for variables or
   * `{ resourceType: "account", accountId, variableKey }` for accounts.
   */
  extraShareArgs: Record<string, unknown>;
  /** One-time notice shown after generation (noun differs per resource). */
  oneTimeDestroyedMessage: string;
  /** Sentry source tag + resource-specific extras for unexpected failures. */
  sentry: { source: string; extra: Record<string, unknown> };
  /**
   * The signed-in user's email. Used to block self-sharing client-side (the
   * backend rejects it too); omit if unavailable and the backend guard still
   * applies.
   */
  currentUserEmail?: string;
  onClose: () => void;
}

/**
 * External one-time / time-limited share link form. Handles recipient email
 * chips, share mode + TTL, optional passphrase, client-side encryption, share
 * creation, and the post-generation URL/copy screen. Shared verbatim between
 * the variable and account share drawers — the only divergence is captured by
 * `buildPayload`, `extraShareArgs`, and the copy-string props.
 */
export function ShareLinkForm({
  organizationId,
  projectId,
  buildPayload,
  extraShareArgs,
  oneTimeDestroyedMessage,
  sentry,
  currentUserEmail,
  onClose,
}: ShareLinkFormProps) {
  const createShare = useCreateShare();
  const { user } = useAuth();
  // Prop wins when provided (e.g. tests); otherwise fall back to the signed-in
  // user's email so we can block self-sharing before the request is sent.
  const selfEmail = (currentUserEmail ?? user?.email)?.trim().toLowerCase();

  const [mode, setMode] = useState<ShareMode>("one_time");
  const [ttlMs, setTtlMs] = useState(86_400_000);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailsFailed, setEmailsFailed] = useState<string[]>([]);

  const handleAddEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Invalid email format");
      return;
    }
    if (selfEmail && trimmed === selfEmail) {
      setError("You already have access — you can't share with yourself");
      return;
    }
    if (emails.includes(trimmed)) {
      setError("Email already added");
      return;
    }
    if (emails.length >= 10) {
      setError("Maximum 10 recipients");
      return;
    }
    setEmails([...emails, trimmed]);
    setEmailInput("");
    setError(null);
  };

  const handleGenerate = async () => {
    if (emails.length === 0) {
      setError("Add at least one recipient email");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const payload = await buildPayload();
      if (payload == null) return;

      const clientKey = generateClientKey();
      const encryptedPayload = await encryptForShare(
        payload,
        clientKey,
        usePassphrase ? passphrase : undefined
      );

      const result = await createShare.mutateAsync({
        ...extraShareArgs,
        organizationId,
        projectId,
        encryptedPayload,
        mode,
        ttlMs,
        hasPassphrase: usePassphrase,
        recipientEmails: emails,
        clientKeyBase64Url: clientKeyToBase64Url(clientKey),
      } as Parameters<typeof createShare.mutateAsync>[0]);

      const origin = window.location.origin;
      setEmailsFailed(result.emailsFailed ?? []);
      setGeneratedUrl(
        `${origin}/s/${result.token}#${clientKeyToBase64Url(clientKey)}`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create share";
      const cleanMessage = message
        .replace(/\[Request ID: [^\]]+\]\s*/g, "")
        .replace(/\s*at\s+\S+\s+\([^)]*\)/g, "")
        .trim();
      setError(cleanMessage || "Failed to create share. Please try again.");

      if (!message.includes("limit") && !message.includes("Upgrade")) {
        Sentry.captureException(err, {
          tags: { source: sentry.source, action: "generate" },
          extra: {
            ...sentry.extra,
            mode,
            recipientCount: emails.length,
          },
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op fallback
    }
  };

  if (generatedUrl) {
    return (
      <div className="space-y-4">
        {(() => {
          const sentCount = emails.length - emailsFailed.length;
          return (
            <div className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 bg-accent-soft">
              <Check className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium text-accent">
                {sentCount > 0
                  ? `Share link created and sent to ${sentCount} recipient${
                      sentCount === 1 ? "" : "s"
                    }`
                  : "Share link created"}
              </span>
            </div>
          );
        })()}

        {emailsFailed.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 bg-warning-soft">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="text-xs text-warning">
              <p className="font-medium">
                Notification email could not be delivered to{" "}
                {emailsFailed.length} recipient
                {emailsFailed.length === 1 ? "" : "s"}.
              </p>
              <p className="mt-0.5 break-words">
                {emailsFailed.join(", ")} — the share link above is still valid;
                send it to them directly.
              </p>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">
            Share Link
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-surface-raised px-3 py-2 font-mono text-xs text-ink-faint bg-surface-raised text-ink-muted">
              {generatedUrl}
            </code>
            <button
              onClick={handleCopyUrl}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 bg-warning-soft">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-xs text-warning">
            <p className="font-medium">
              This link contains the decryption key.
            </p>
            <p className="mt-0.5">
              It cannot be regenerated. Share it securely with your recipient
              {emails.length > 1 ? "s" : ""}.
            </p>
          </div>
        </div>

        {mode === "one_time" && (
          <p className="text-xs text-ink-muted">{oneTimeDestroyedMessage}</p>
        )}

        <div className="flex justify-end border-t border-line pt-4 border-line">
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-raised px-4 py-2 text-sm font-medium text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Recipient Emails */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-muted">
          Recipient Emails
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddEmail();
              }
            }}
            placeholder="Enter email and press Enter"
            className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-inverse placeholder:text-ink-muted focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line border-line bg-surface text-ink"
          />
          <button
            type="button"
            onClick={handleAddEmail}
            className="rounded-lg bg-surface-raised px-3 py-2 text-sm font-medium text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
          >
            Add
          </button>
        </div>
        {emails.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {emails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-hover bg-accent-soft text-accent"
              >
                <Mail className="h-3 w-3" />
                {email}
                <button
                  type="button"
                  onClick={() => setEmails(emails.filter((e) => e !== email))}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-accent"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mode */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-muted">
          Share Mode
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("one_time")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mode === "one_time"
                ? "border-accent-line bg-accent-soft text-accent-hover border-accent-line bg-accent-soft text-accent"
                : "border-line text-ink-faint hover:border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            One-time view
            {mode === "one_time" && (
              <span className="ml-1.5 text-xs opacity-70">Recommended</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode("time_limited")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              mode === "time_limited"
                ? "border-accent-line bg-accent-soft text-accent-hover border-accent-line bg-accent-soft text-accent"
                : "border-line text-ink-faint hover:border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            Time-limited
          </button>
        </div>
      </div>

      {/* TTL */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink-muted">
          Expires After
        </label>
        <div className="flex gap-2">
          {TTL_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setTtlMs(opt.ms)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                ttlMs === opt.ms
                  ? "bg-accent text-white"
                  : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Passphrase */}
      <div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={usePassphrase}
            onChange={(e) => setUsePassphrase(e.target.checked)}
            className="h-4 w-4 rounded border-line text-accent focus:ring-accent-line"
          />
          <span className="text-sm text-ink-muted">
            Add passphrase protection
          </span>
        </label>
        {usePassphrase && (
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Enter a passphrase"
            className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink-inverse placeholder:text-ink-muted focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line border-line bg-surface text-ink"
          />
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 border-t border-line pt-4 border-line">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-faint hover:bg-surface-hover border-line text-ink-muted hover:bg-surface-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={
            isGenerating ||
            emails.length === 0 ||
            (usePassphrase && !passphrase)
          }
          className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating…
            </span>
          ) : (
            "Generate & Send"
          )}
        </button>
      </div>
    </div>
  );
}
