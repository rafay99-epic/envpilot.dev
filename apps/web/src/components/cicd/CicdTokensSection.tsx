"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  Check,
  ChevronDown,
  Terminal as TerminalIcon,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import * as Sentry from "@sentry/nextjs";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  TerminalCard,
  TerminalButton,
  TerminalInput,
  TerminalBadge,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { ENVIRONMENTS, type Environment } from "@/constants/project";

/**
 * Capture UNEXPECTED token-management failures. Expected validation/authz
 * rejections (tier gate, role, scope, token cap) are user-facing states the
 * UI already renders — alerting on them would bury real breakage.
 */
function reportCicdUiError(error: unknown, action: "create" | "revoke") {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /pro plan|not authorized|only the organization|at most|at least one environment|must be 1-100/i.test(
      message
    )
  ) {
    return;
  }
  Sentry.captureException(error, {
    tags: { source: "cicd-ui", action },
  });
}

const ENV_BADGE_COLOR: Record<Environment, "blue" | "amber" | "green"> = {
  development: "blue",
  staging: "amber",
  production: "green",
};

const ENV_CHIP_SELECTED: Record<Environment, string> = {
  development: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  staging: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  production: "border-green-500/40 bg-green-500/10 text-green-400",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface CicdTokensSectionProps {
  projectId: Id<"projects">;
  organizationId: Id<"organizations"> | undefined;
}

/**
 * "CI/CD Tokens" project settings section. Lets owners/PMs/team-leads mint
 * and revoke read-only service tokens for the GitHub Action. Pro-gated via
 * the `cicd_service_tokens` registry feature (server enforces the same
 * gate — this is UX, not the security boundary).
 *
 * Everything here is inline — no modals, no confirm dialogs. Creation
 * expands a panel above the list; revocation swaps the row's button for an
 * in-place confirm strip.
 */
export function CicdTokensSection({
  projectId,
  organizationId,
}: CicdTokensSectionProps) {
  return (
    <FeatureGate
      organizationId={organizationId}
      featureKey="cicd_service_tokens"
      featureName="CI/CD Service Tokens"
      fallbackVariant="card"
    >
      <CicdTokensSectionInner projectId={projectId} />
    </FeatureGate>
  );
}

function CicdTokensSectionInner({ projectId }: { projectId: Id<"projects"> }) {
  const tokens = useQuery(api.features.cicd.tokens.listForProject, {
    projectId,
  });
  const isLoading = tokens === undefined;

  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <TerminalCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              CI/CD Tokens
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Read-only tokens for the Envpilot GitHub Action to pull variables
              during deploys.
            </p>
          </div>
          <TerminalButton
            type="button"
            variant={showCreate ? "secondary" : "primary"}
            onClick={() => setShowCreate((prev) => !prev)}
            aria-expanded={showCreate}
          >
            {showCreate ? "Close" : "New Token"}
          </TerminalButton>
        </div>

        <AnimatePresence initial={false}>
          {showCreate && (
            <motion.div
              key="create-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="mt-6">
                <CreateTokenPanel
                  projectId={projectId}
                  onDone={() => setShowCreate(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6">
          {isLoading ? (
            <TerminalLoading />
          ) : tokens.length === 0 ? (
            !showCreate && (
              <TerminalEmptyState
                command="envpilot-action --token $ENVPILOT_TOKEN"
                message="No CI/CD tokens yet. Create one to let your pipeline pull variables."
                action={{
                  label: "New Token",
                  onClick: () => setShowCreate(true),
                }}
              />
            )
          ) : (
            <ul className="divide-y divide-zinc-800">
              {tokens.map((token) => (
                <TokenRow key={token._id} token={token} />
              ))}
            </ul>
          )}
        </div>
      </TerminalCard>
    </div>
  );
}

interface TokenListItem {
  _id: Id<"serviceTokens">;
  name: string;
  environments: string[];
  createdAt: number;
  createdByName: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

function TokenRow({ token }: { token: TokenListItem }) {
  const revoke = useMutation(api.features.cicd.tokens.revoke);
  const isRevoked = token.revokedAt !== null;

  const [confirming, setConfirming] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const recentlyUsed =
    token.lastUsedAt !== null && Date.now() - token.lastUsedAt < SEVEN_DAYS_MS;

  const handleConfirmRevoke = async () => {
    setIsRevoking(true);
    setRowError(null);
    try {
      await revoke({ tokenId: token._id });
      setConfirming(false);
    } catch (err) {
      reportCicdUiError(err, "revoke");
      setRowError(
        err instanceof Error ? err.message : "Failed to revoke token"
      );
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <li className={`py-4 ${isRevoked ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm font-medium text-zinc-100">
              {token.name}
            </span>
            {isRevoked && <TerminalBadge color="red">Revoked</TerminalBadge>}
            {token.environments.map((env) => (
              <TerminalBadge
                key={env}
                color={ENV_BADGE_COLOR[env as Environment] ?? "zinc"}
              >
                {env}
              </TerminalBadge>
            ))}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
            <span>
              Created by {token.createdByName}{" "}
              {formatDistanceToNow(new Date(token.createdAt), {
                addSuffix: true,
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  recentlyUsed ? "bg-green-400" : "bg-zinc-600"
                }`}
                aria-hidden="true"
              />
              {token.lastUsedAt
                ? `last used ${formatDistanceToNow(new Date(token.lastUsedAt), {
                    addSuffix: true,
                  })}`
                : "never used"}
            </span>
          </p>
        </div>

        {/* The action slot holds ONLY the compact Revoke button — the
            confirm strip renders full-width BELOW the row so it never
            competes with (and crushes) the name/metadata column. */}
        {!isRevoked && !confirming && (
          <TerminalButton
            type="button"
            variant="danger"
            onClick={() => setConfirming(true)}
          >
            Revoke
          </TerminalButton>
        )}
      </div>

      {!isRevoked && (
        <AnimatePresence initial={false}>
          {confirming && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-red-400">
                    Revoke this token? CI using it will stop working
                    immediately.
                  </p>
                  {rowError && (
                    <p className="mt-1 text-xs font-medium text-red-400">
                      {rowError}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TerminalButton
                    type="button"
                    variant="danger"
                    onClick={handleConfirmRevoke}
                    disabled={isRevoking}
                  >
                    {isRevoking ? "Revoking..." : "Revoke"}
                  </TerminalButton>
                  <TerminalButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming(false);
                      setRowError(null);
                    }}
                    disabled={isRevoking}
                  >
                    Cancel
                  </TerminalButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </li>
  );
}

// ============================================================
// Inline create panel (form → one-time reveal, no dialog)
// ============================================================

function CreateTokenPanel({
  projectId,
  onDone,
}: {
  projectId: Id<"projects">;
  onDone: () => void;
}) {
  const createToken = useAction(api.features.cicd.tokens.create);

  const [name, setName] = useState("");
  const [environments, setEnvironments] = useState<Set<Environment>>(
    new Set<Environment>(["production"])
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);

  const toggleEnvironment = (env: Environment) => {
    setEnvironments((prev) => {
      const next = new Set(prev);
      if (next.has(env)) {
        next.delete(env);
      } else {
        next.add(env);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || environments.size === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createToken({
        projectId,
        name: name.trim(),
        environments: Array.from(environments),
      });
      // Held only in this panel's local state — never persisted, never
      // logged, cleared when the panel collapses (unmount on "Done").
      setCreatedToken(result.token);
    } catch (err) {
      reportCicdUiError(err, "create");
      setError(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op fallback
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 ${
        createdToken
          ? "border-green-500/30 bg-green-500/5"
          : "border-zinc-700 bg-zinc-950/40"
      }`}
    >
      {createdToken ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-semibold text-green-400">
              Token created
            </h3>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-900/10 px-3 py-2">
            <span className="text-sm text-amber-400">
              <span className="font-semibold">
                Copy it now — you won&apos;t see this token again.
              </span>{" "}
              Envpilot only stores its hash.
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Token
            </label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200">
                {createdToken}
              </code>
              <TerminalButton
                type="button"
                onClick={handleCopy}
                className="shrink-0"
                aria-label="Copy token"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </TerminalButton>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowSnippet((prev) => !prev)}
              aria-expanded={showSnippet}
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
            >
              <TerminalIcon className="h-3.5 w-3.5" />
              GitHub Actions usage
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showSnippet ? "rotate-180" : ""
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {showSnippet && (
                <motion.div
                  key="snippet"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-300">
                    {`- uses: rafay99-epic/envpilot-action@v1
  with:
    token: \${{ secrets.ENVPILOT_TOKEN }}
    environment: production`}
                  </pre>
                  <p className="mt-1 text-xs text-zinc-500">
                    Store the token as the{" "}
                    <code className="rounded bg-zinc-800 px-1 py-0.5">
                      ENVPILOT_TOKEN
                    </code>{" "}
                    repository secret.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex justify-end">
            <TerminalButton type="button" onClick={onDone}>
              Done
            </TerminalButton>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">
            New CI/CD Token
          </h3>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="cicd-token-name"
              className="block text-sm font-medium text-zinc-300"
            >
              Name
            </label>
            <TerminalInput
              id="cicd-token-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. production-deploy"
              required
              maxLength={100}
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Environments
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ENVIRONMENTS.map((env) => {
                const selected = environments.has(env);
                return (
                  <button
                    key={env}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleEnvironment(env)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                      selected
                        ? ENV_CHIP_SELECTED[env]
                        : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                    }`}
                  >
                    {env}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Recommended: scope tokens to a single environment.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <TerminalButton
              type="button"
              variant="secondary"
              onClick={onDone}
              disabled={isSubmitting}
            >
              Cancel
            </TerminalButton>
            <TerminalButton
              type="submit"
              disabled={isSubmitting || !name.trim() || environments.size === 0}
            >
              {isSubmitting ? "Creating..." : "Create Token"}
            </TerminalButton>
          </div>
        </form>
      )}
    </div>
  );
}
