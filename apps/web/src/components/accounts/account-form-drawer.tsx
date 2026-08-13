"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import {
  ENVIRONMENTS,
  envToggleClasses,
  type Environment,
} from "@/constants/project";
import type { Account } from "@/hooks";
import { isSafeHttpUrl } from "@/lib/account-payload";
import type { AccountVaultPayload } from "@/lib/account-payload";

export interface AccountFormData {
  name: string;
  websiteUrl: string;
  username: string;
  password: string;
  description: string;
  environments: Environment[];
  /** Edit-mode signal: true when the credentials were changed by the user. */
  credentialsChanged: boolean;
}

interface AccountFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AccountFormData) => Promise<void>;
  /** Present ⇒ edit mode. */
  account?: Account | null;
  /** Reveal function used to prefill credentials when editing. */
  onRevealCredentials?: () => Promise<AccountVaultPayload | null>;
  title?: string;
  submitLabel?: string;
}

export function AccountFormDrawer({
  isOpen,
  onClose,
  onSubmit,
  account,
  onRevealCredentials,
  title,
  submitLabel,
}: AccountFormDrawerProps) {
  const isEditing = !!account;

  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [description, setDescription] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([
    "development",
  ]);

  const [showPassword, setShowPassword] = useState(false);
  const [credentialsDirty, setCredentialsDirty] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset / hydrate form whenever the drawer opens (or the target changes).
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setShowPassword(false);
    setCredentialsDirty(false);
    setPrefillFailed(false);
    setUsername("");
    setPassword("");

    if (account) {
      setName(account.name);
      setWebsiteUrl(account.websiteUrl ?? "");
      setDescription(account.description ?? "");
      setEnvironments(account.environments as Environment[]);
    } else {
      setName("");
      setWebsiteUrl("");
      setDescription("");
      setEnvironments(["development"]);
    }
  }, [isOpen, account]);

  // Keep the latest reveal function in a ref so the prefill effect can depend
  // only on [isOpen, account] — otherwise an unstable prop identity would
  // cancel the in-flight fetch and re-fire the audit log on every render.
  const revealRef = useRef(onRevealCredentials);
  useEffect(() => {
    revealRef.current = onRevealCredentials;
  });

  // Prefill credentials in edit mode via the reveal function (once per open).
  useEffect(() => {
    if (!isOpen || !account) return;
    const reveal = revealRef.current;
    if (!reveal) return;
    let cancelled = false;

    setIsPrefilling(true);
    setPrefillFailed(false);
    reveal()
      .then((creds) => {
        if (cancelled) return;
        if (creds) {
          setUsername(creds.username);
          setPassword(creds.password);
        } else {
          setPrefillFailed(true);
        }
      })
      .catch(() => {
        // A rejected reveal (network/vault error) must surface the same
        // "could not load" guidance as a null result — otherwise it fails
        // silently and the form looks blank.
        if (!cancelled) setPrefillFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsPrefilling(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, account]);

  const toggleEnvironment = (env: Environment) => {
    setEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (environments.length === 0) {
      setError("At least one environment is required");
      return;
    }
    if (websiteUrl.trim() && !isSafeHttpUrl(websiteUrl)) {
      setError("Website URL must start with http:// or https://");
      return;
    }

    // Credentials are required on create; on edit they only matter when changed.
    const credentialsChanged = !isEditing || credentialsDirty;
    if (credentialsChanged) {
      if (!username.trim() || !password.trim()) {
        setError(
          isEditing
            ? "Both username and password are required to update credentials"
            : "Username and password are required"
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        websiteUrl: websiteUrl.trim(),
        username: credentialsChanged ? username : "",
        password: credentialsChanged ? password : "",
        description: description.trim(),
        environments,
        credentialsChanged,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? (isEditing ? "Edit Account" : "Add Account")}
      preventClose={isSubmitting}
      width="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-danger-soft p-3 text-sm text-danger bg-danger-soft text-danger">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label
            htmlFor="account-name"
            className="block text-sm font-medium text-ink-muted"
          >
            Name <span className="text-danger">*</span>
          </label>
          <input
            id="account-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stripe Dashboard"
            className="mt-1 block w-full rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
          />
        </div>

        {/* Website URL */}
        <div>
          <label
            htmlFor="account-url"
            className="block text-sm font-medium text-ink-muted"
          >
            Website URL <span className="text-ink-muted">(optional)</span>
          </label>
          <input
            id="account-url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://dashboard.stripe.com"
            className="mt-1 block w-full rounded-lg border border-line bg-white px-4 py-2 font-mono text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
          />
        </div>

        {/* Username */}
        <div>
          <label
            htmlFor="account-username"
            className="block text-sm font-medium text-ink-muted"
          >
            Username / Email{" "}
            {!isEditing && <span className="text-danger">*</span>}
          </label>
          <input
            id="account-username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setCredentialsDirty(true);
            }}
            disabled={isPrefilling}
            placeholder={isPrefilling ? "Loading…" : "user@example.com"}
            className="mt-1 block w-full rounded-lg border border-line bg-white px-4 py-2 font-mono text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:bg-surface-raised border-line bg-surface-raised text-ink placeholder-ink-subtle disabled:bg-surface"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="account-password"
            className="block text-sm font-medium text-ink-muted"
          >
            Password {!isEditing && <span className="text-danger">*</span>}
          </label>
          <div className="relative mt-1">
            <input
              id="account-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setCredentialsDirty(true);
              }}
              disabled={isPrefilling}
              placeholder={isPrefilling ? "Loading…" : "••••••••"}
              className="block w-full rounded-lg border border-line bg-white px-4 py-2 pr-10 font-mono text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong disabled:bg-surface-raised border-line bg-surface-raised text-ink placeholder-ink-subtle disabled:bg-surface"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink-muted"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {isEditing && !prefillFailed && (
            <p className="mt-1 text-xs text-ink-muted">
              Editing either field rewrites the stored credentials.
            </p>
          )}
          {isEditing && prefillFailed && (
            <p className="mt-1 text-xs text-warning">
              Could not load existing credentials. Enter both fields to replace
              them, or leave blank to keep the current values.
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="account-description"
            className="block text-sm font-medium text-ink-muted"
          >
            Description <span className="text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="account-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this account is used for…"
            rows={2}
            className="mt-1 block w-full rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
          />
        </div>

        {/* Environments */}
        <div>
          <label className="block text-sm font-medium text-ink-muted">
            Environments <span className="text-danger">*</span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ENVIRONMENTS.map((env) => (
              <button
                key={env}
                type="button"
                onClick={() => toggleEnvironment(env as Environment)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${envToggleClasses(
                  env as Environment,
                  environments.includes(env as Environment)
                )}`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-faint hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 text-ink-muted hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isPrefilling}
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 bg-surface-raised text-ink-inverse hover:bg-surface-hover"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting
              ? "Saving…"
              : (submitLabel ??
                (isEditing ? "Save Changes" : "Create Account"))}
          </button>
        </div>
      </form>
    </DrawerPanel>
  );
}
