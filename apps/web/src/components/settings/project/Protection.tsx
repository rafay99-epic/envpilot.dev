"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { ShieldAlert } from "lucide-react";
import { SettingsSection } from "@envpilot/ui";
import { api } from "@convex/_generated/api";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { TerminalButton } from "@/components/dashboard/terminal-ui";
import { ENVIRONMENTS } from "@/constants/project";
import { useProtection } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import type { Doc } from "@convex/_generated/dataModel";

const BILLING_HREF = "/dashboard/settings?tab=billing";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((env) => other.has(env));
}

/**
 * Protection config. Enforcement never consults the tier registry, so an org
 * that loses the feature keeps its blocked writes — hence the banner below,
 * which sits OUTSIDE the gate so a manager can always clear protection.
 */
export function ProtectionTab({ project }: { project: Doc<"projects"> }) {
  const protection = useProtection(project._id);
  const setProtection = useMutation(
    api.features.projects.protection.setProtection
  );

  const saved = protection?.environments ?? [];
  // null means "unchanged since the server's copy" — no effect needed to
  // reseed when someone else edits protection in another tab.
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = draft ?? saved;
  const dirty = draft !== null && !sameSet(draft, saved);

  const toggle = (env: string) =>
    setDraft(
      selected.includes(env)
        ? selected.filter((e) => e !== env)
        : [...selected, env]
    );

  const commit = async (environments: string[]) => {
    setSaving(true);
    setError(null);
    try {
      await setProtection({ projectId: project._id, environments });
      setDraft(null);
    } catch (err) {
      setError(sanitizeConvexError(err));
    }
    // After the try/catch, not in a finally: one finalizer makes React
    // Compiler bail on the whole component.
    setSaving(false);
  };

  const unavailable = saved.length > 0 && protection?.featureAllowed === false;

  return (
    <>
      {unavailable && (
        <div
          className="mb-6 flex flex-wrap items-center gap-3 border-b border-warning-line pb-6"
          data-testid="protection-banner"
        >
          <ShieldAlert
            className="h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 text-[13px] text-ink-muted">
            Protected environments is not available on your plan. Writes to{" "}
            {saved.join(", ")} stay blocked until you upgrade or remove
            protection.
          </p>
          <Link
            href={BILLING_HREF}
            className="rounded-panel border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-hover"
          >
            Upgrade
          </Link>
          <TerminalButton
            type="button"
            variant="secondary"
            data-testid="protection-remove"
            disabled={saving}
            onClick={() => void commit([])}
          >
            Remove protection
          </TerminalButton>
        </div>
      )}

      <FeatureGate
        organizationId={project.organizationId}
        featureKey="protected_environments"
        featureName="Protected Environments"
        fallbackVariant="hide"
      >
        <SettingsSection
          title="Protected environments"
          description="A write to a protected environment becomes a change request that a second person applies."
        >
          <div className="space-y-3">
            {ENVIRONMENTS.map((env) => (
              <label key={env} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  data-testid={`protection-checkbox-${env}`}
                  checked={selected.includes(env)}
                  onChange={() => toggle(env)}
                  className="h-4 w-4"
                />
                <span className="text-sm capitalize text-ink">{env}</span>
              </label>
            ))}
          </div>

          {protection && protection.pendingCount > 0 && (
            <p className="text-[13px] text-ink-subtle">
              {protection.pendingCount} change request
              {protection.pendingCount === 1 ? "" : "s"} pending.
            </p>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div>
            <TerminalButton
              type="button"
              data-testid="protection-save"
              disabled={!dirty || saving}
              onClick={() => void commit(selected)}
            >
              {saving ? "Saving..." : "Save protection"}
            </TerminalButton>
          </div>
        </SettingsSection>
      </FeatureGate>
    </>
  );
}
