"use client";

import { useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { X, Copy, Check, Loader2, Mail, AlertTriangle } from "lucide-react";
import {
  generateClientKey,
  clientKeyToBase64Url,
  encryptForShare,
} from "@/lib/share-crypto";
import { useCreateShare } from "@/hooks/useShareSecret";

interface ShareSecretDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  variable: {
    _id: Id<"environmentVariables">;
    key: string;
  };
  organizationId: string;
  projectId: string;
  onRevealValue: () => Promise<string | null>;
}

type ShareMode = "one_time" | "time_limited";

const TTL_OPTIONS = [
  { label: "1h", ms: 3_600_000 },
  { label: "6h", ms: 21_600_000 },
  { label: "24h", ms: 86_400_000 },
  { label: "7d", ms: 604_800_000 },
];

export function ShareSecretDrawer({
  isOpen,
  onClose,
  variable,
  organizationId,
  projectId,
  onRevealValue,
}: ShareSecretDrawerProps) {
  const [mode, setMode] = useState<ShareMode>("one_time");
  const [ttlMs, setTtlMs] = useState(86_400_000); // 24h default
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createShare = useCreateShare();

  const handleAddEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Invalid email format");
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleRemoveEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const handleGenerate = async () => {
    if (emails.length === 0) {
      setError("Add at least one recipient email");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // 1. Reveal the variable value
      const plaintext = await onRevealValue();
      if (!plaintext) {
        throw new Error("Failed to retrieve variable value");
      }

      // 2. Generate client key and encrypt
      const clientKey = generateClientKey();
      const encryptedPayload = await encryptForShare(
        plaintext,
        clientKey,
        usePassphrase ? passphrase : undefined
      );

      // 3. Create share on server (include clientKey so the email link works)
      const result = await createShare.mutateAsync({
        variableId: variable._id,
        variableKey: variable.key,
        organizationId,
        projectId,
        encryptedPayload,
        mode,
        ttlMs,
        hasPassphrase: usePassphrase,
        recipientEmails: emails,
        clientKeyBase64Url: clientKeyToBase64Url(clientKey),
      });

      // 4. Construct the full URL with client key in fragment
      const origin = window.location.origin;
      const url = `${origin}/s/${result.token}#${clientKeyToBase64Url(clientKey)}`;
      setGeneratedUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share");
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
      // Fallback
    }
  };

  const handleClose = () => {
    // Reset state
    setMode("one_time");
    setTtlMs(86_400_000);
    setEmails([]);
    setEmailInput("");
    setUsePassphrase(false);
    setPassphrase("");
    setGeneratedUrl(null);
    setCopied(false);
    setError(null);
    onClose();
  };

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Share Secret"
      width="lg"
    >
      <div className="-mx-6 -my-4 flex h-[calc(100%+2rem)] flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Variable Key */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Variable
            </label>
            <code className="block rounded-lg bg-zinc-100 px-3 py-2 font-mono text-sm font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              {variable.key}
            </code>
          </div>

          {!generatedUrl ? (
            <>
              {/* Recipient Emails */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Recipient Emails
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter email and press Enter"
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    onClick={handleAddEmail}
                    className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    Add
                  </button>
                </div>
                {emails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {emails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      >
                        <Mail className="h-3 w-3" />
                        {email}
                        <button
                          onClick={() => handleRemoveEmail(email)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-green-200 dark:hover:bg-green-800"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Mode Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Share Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode("one_time")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      mode === "one_time"
                        ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/20 dark:text-green-400"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    One-time view
                    {mode === "one_time" && (
                      <span className="ml-1.5 text-xs opacity-70">Recommended</span>
                    )}
                  </button>
                  <button
                    onClick={() => setMode("time_limited")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      mode === "time_limited"
                        ? "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/20 dark:text-green-400"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    Time-limited
                  </button>
                </div>
              </div>

              {/* TTL Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Expires After
                </label>
                <div className="flex gap-2">
                  {TTL_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setTtlMs(opt.ms)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        ttlMs === opt.ms
                          ? "bg-green-500 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Passphrase Toggle */}
              <div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={usePassphrase}
                    onChange={(e) => setUsePassphrase(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    Add passphrase protection
                  </span>
                </label>
                {usePassphrase && (
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter a passphrase"
                    className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                )}
              </div>
            </>
          ) : (
            /* After generation — show the URL */
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/20">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  Share link created and sent to {emails.length} recipient{emails.length === 1 ? "" : "s"}
                </span>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Share Link
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {generatedUrl}
                  </code>
                  <button
                    onClick={handleCopyUrl}
                    className="shrink-0 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  <p className="font-medium">This link contains the decryption key.</p>
                  <p className="mt-0.5">It cannot be regenerated. Share it securely with your recipient{emails.length > 1 ? "s" : ""}.</p>
                </div>
              </div>

              {mode === "one_time" && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  The secret will be permanently destroyed after the first view.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          {!generatedUrl ? (
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || emails.length === 0 || (usePassphrase && !passphrase)}
                className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "Generate & Send"
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </DrawerPanel>
  );
}
