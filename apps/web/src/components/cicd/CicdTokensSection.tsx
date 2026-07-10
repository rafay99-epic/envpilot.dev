"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Copy, Check, Terminal as TerminalIcon } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { ConfirmDialog, Modal } from "@/components/ui";
import {
  TerminalCard,
  TerminalButton,
  TerminalInput,
  TerminalBadge,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { ENVIRONMENTS, type Environment } from "@/constants/project";

const ENV_BADGE_COLOR: Record<Environment, "blue" | "amber" | "green"> = {
  development: "blue",
  staging: "amber",
  production: "green",
};

interface CicdTokensSectionProps {
  projectId: Id<"projects">;
  organizationId: Id<"organizations"> | undefined;
}

/**
 * "CI/CD Tokens" project settings section. Lets owners/PMs/team-leads mint
 * and revoke read-only service tokens for the GitHub Action. Pro-gated via
 * the `cicd_service_tokens` registry feature (server enforces the same
 * gate — this is UX, not the security boundary).
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
  const [revokingToken, setRevokingToken] = useState<{
    id: Id<"serviceTokens">;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = useMutation(api.features.cicd.tokens.revoke);

  const handleRevoke = async () => {
    if (!revokingToken) return;
    setError(null);
    try {
      await revoke({ tokenId: revokingToken.id });
      setRevokingToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke token");
      throw err;
    }
  };

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
          <TerminalButton onClick={() => setShowCreate(true)}>
            New Token
          </TerminalButton>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="mt-6">
          {isLoading ? (
            <TerminalLoading />
          ) : tokens.length === 0 ? (
            <TerminalEmptyState
              command="envpilot-action --token $ENVPILOT_TOKEN"
              message="No CI/CD tokens yet. Create one to let your pipeline pull variables."
              action={{
                label: "New Token",
                onClick: () => setShowCreate(true),
              }}
            />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {tokens.map((token) => (
                <TokenRow
                  key={token._id}
                  token={token}
                  onRevoke={() =>
                    setRevokingToken({ id: token._id, name: token.name })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </TerminalCard>

      <CreateTokenDialog
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        projectId={projectId}
      />

      <ConfirmDialog
        isOpen={!!revokingToken}
        onClose={() => setRevokingToken(null)}
        onConfirm={handleRevoke}
        title="Revoke Token"
        message={`Are you sure you want to revoke "${revokingToken?.name}"? Any pipeline still using it will immediately lose access.`}
        confirmText="Revoke"
        variant="danger"
      />
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

function TokenRow({
  token,
  onRevoke,
}: {
  token: TokenListItem;
  onRevoke: () => void;
}) {
  const isRevoked = token.revokedAt !== null;

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 py-4 ${
        isRevoked ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-100">
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
        <p className="mt-1 text-xs text-zinc-500">
          Created by {token.createdByName}{" "}
          {formatDistanceToNow(new Date(token.createdAt), {
            addSuffix: true,
          })}
          {" · "}
          {token.lastUsedAt
            ? `last used ${formatDistanceToNow(new Date(token.lastUsedAt), {
                addSuffix: true,
              })}`
            : "never used"}
        </p>
      </div>
      {!isRevoked && (
        <TerminalButton variant="danger" onClick={onRevoke}>
          Revoke
        </TerminalButton>
      )}
    </li>
  );
}

// ============================================================
// Create dialog
// ============================================================

function CreateTokenDialog({
  isOpen,
  onClose,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: Id<"projects">;
}) {
  const createToken = useAction(api.features.cicd.tokens.create);

  const [name, setName] = useState("");
  const [environments, setEnvironments] = useState<Set<string>>(
    new Set(["production"])
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetAndClose = () => {
    setName("");
    setEnvironments(new Set(["production"]));
    setError(null);
    setCreatedToken(null);
    setCopied(false);
    onClose();
  };

  const toggleEnvironment = (env: string) => {
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
    if (!name.trim() || environments.size === 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createToken({
        projectId,
        name: name.trim(),
        environments: Array.from(environments),
      });
      // Held only in this dialog's local state — never persisted, never
      // logged, cleared on close.
      setCreatedToken(result.token);
    } catch (err) {
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
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={createdToken ? "Token Created" : "New CI/CD Token"}
      size="lg"
    >
      {createdToken ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-900/10 px-3 py-2">
            <span className="text-sm text-amber-400">
              <span className="font-semibold">
                Copy this token now — you won&apos;t see it again.
              </span>{" "}
              Envpilot only stores its hash.
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Token
            </label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-200">
                {createdToken}
              </code>
              <TerminalButton
                type="button"
                onClick={handleCopy}
                className="shrink-0"
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
            <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
              <TerminalIcon className="h-3.5 w-3.5" />
              GitHub Actions usage
            </label>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-300">
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
          </div>

          <div className="flex justify-end">
            <TerminalButton onClick={resetAndClose}>Done</TerminalButton>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Name
            </label>
            <TerminalInput
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
            <p className="mt-1 text-xs text-zinc-500">
              Recommended: scope to production only.
            </p>
            <div className="mt-2 space-y-2">
              {ENVIRONMENTS.map((env) => (
                <label
                  key={env}
                  className="flex items-center gap-2 text-sm text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={environments.has(env)}
                    onChange={() => toggleEnvironment(env)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-green-500 focus:ring-1 focus:ring-green-500/30"
                  />
                  <span className="capitalize">{env}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <TerminalButton
              type="button"
              variant="secondary"
              onClick={resetAndClose}
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
    </Modal>
  );
}
