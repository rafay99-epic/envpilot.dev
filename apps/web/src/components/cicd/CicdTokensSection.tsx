"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ArrowRight } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import * as Sentry from "@sentry/nextjs";
import { FeatureGate } from "@/components/tier/FeatureGate";
import {
  TerminalCard,
  TerminalButton,
  TerminalBadge,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { useAuthContext } from "@/components/auth/auth-provider";
import { type Environment } from "@/constants/project";

/**
 * Capture UNEXPECTED token-management failures. Expected validation/authz
 * rejections are user-facing states the UI already renders — alerting on
 * them would bury real breakage.
 */
function reportCicdUiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/pro plan|not authorized|only the organization/i.test(message)) {
    return;
  }
  Sentry.captureException(error, {
    tags: { source: "cicd-ui", action: "revoke" },
  });
}

const ENV_BADGE_COLOR: Record<Environment, "blue" | "amber" | "green"> = {
  development: "blue",
  staging: "amber",
  production: "green",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface CicdTokensSectionProps {
  projectId: Id<"projects">;
  organizationId: Id<"organizations"> | undefined;
}

/**
 * "CI/CD Tokens" project settings section — LEGACY, revoke-only.
 *
 * Service-token creation moved to the unified API Keys section
 * (Organization Settings → API Keys): a GitHub Action key is just an API
 * key with the `github_action` surface, scoped to one project + the
 * `variables` resource. Tokens minted here before the move keep working
 * (the pull path still accepts them) and can still be revoked below; the
 * whole section disappears once the legacy `serviceTokens` table is
 * drained and dropped.
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
  const { organization } = useAuthContext();
  const tokens = useQuery(api.features.cicd.tokens.listForProject, {
    projectId,
  });
  const isLoading = tokens === undefined;

  const apiKeysHref = organization?.slug
    ? `/organizations/${organization.slug}/settings?tab=apiKeys`
    : "/organizations";

  return (
    <div className="space-y-6">
      <TerminalCard>
        <div>
          <h2 className="text-base font-semibold text-zinc-100">
            CI/CD Tokens
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Read-only tokens for the Envpilot GitHub Action to pull variables
            during deploys.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
          <p className="text-sm text-zinc-300">
            Tokens are now created as{" "}
            <span className="font-medium text-green-400">API keys</span> with
            the GitHub Action surface — one key model for every machine
            credential.
          </p>
          <Link href={apiKeysHref} data-testid="cicd-goto-api-keys">
            <TerminalButton type="button">
              <span className="inline-flex items-center gap-1.5">
                Open API Keys
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </TerminalButton>
          </Link>
        </div>

        <div className="mt-6">
          {isLoading ? (
            <TerminalLoading />
          ) : tokens.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No legacy tokens for this project. New tokens are minted from the
              API Keys section above.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-zinc-500">
                Legacy tokens minted before the move. They keep working and can
                be revoked here.
              </p>
              <ul className="divide-y divide-zinc-800">
                {tokens.map((token) => (
                  <TokenRow key={token._id} token={token} />
                ))}
              </ul>
            </>
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
      reportCicdUiError(err);
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
