"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { SettingsRow, SettingsSection } from "@envpilot/ui";
import { useAuthContext } from "@/components/auth";
import { TerminalSelect } from "@/components/dashboard/terminal-ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useProjectMembers, useUpdateProject } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

export function IntegrationsTab({ project }: { project: Doc<"projects"> }) {
  const { organization } = useAuthContext();

  return (
    <FeatureGate
      organizationId={organization?.id as Id<"organizations"> | undefined}
      featureKey="vscode_unsync_customization"
      featureName="VS Code Unsync Customization"
      fallbackVariant="line"
    >
      <VscodeSync project={project} />
    </FeatureGate>
  );
}

function VscodeSync({ project }: { project: Doc<"projects"> }) {
  const projectId = project._id;
  const { members, isLoading: membersLoading } = useProjectMembers(projectId);
  const setMemberOverride = useMutation(
    api.features.projects.mutations.setMemberUnsyncOverride
  );
  const updateProject = useUpdateProject();

  const [enabled, setEnabled] = useState(
    project.vscodeAutoUnsyncOnClose ?? true
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setIsSaving(true);
    setError(null);

    try {
      await updateProject({
        projectId: project._id,
        vscodeAutoUnsyncOnClose: next,
      });
    } catch (err) {
      // Revert on error
      setEnabled(!next);
      setError(sanitizeConvexError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOverrideChange = async (
    userId: Id<"users">,
    raw: string // "inherit" | "on" | "off"
  ) => {
    setSavingUserId(userId);
    setError(null);
    try {
      await setMemberOverride({
        projectId,
        userId,
        value: raw === "inherit" ? null : raw === "on",
      });
    } catch (err) {
      setError(sanitizeConvexError(err));
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <>
      <SettingsSection
        title="VS Code sync"
        description="What the extension does with synced .env files on this project."
      >
        {error && <p className="text-[13px] text-danger">{error}</p>}

        <SettingsRow
          label="Unsync on close"
          description="When VS Code closes, synced .env files for this project are removed from the developer's machine. Hand-edited files are never deleted."
          control={
            <button
              type="button"
              aria-label="Unsync on close"
              aria-pressed={enabled}
              onClick={handleToggle}
              disabled={isSaving}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                enabled ? "bg-accent" : "bg-surface-hover"
              } ${isSaving ? "opacity-50" : ""}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Member overrides"
        description="Override the project default for individual members."
      >
        {membersLoading ? (
          <p className="text-[13px] text-ink-faint">Loading members...</p>
        ) : members.length === 0 ? (
          <p className="text-[13px] text-ink-faint">
            No members assigned to this project.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((member) => {
              const memberName =
                member.user?.name || member.user?.email || "Unknown member";
              const resolved = member.vscodeAutoUnsyncOnClose ?? enabled;
              return (
                <li
                  key={member._id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{memberName}</p>
                    <p className="text-xs text-ink-subtle">
                      {resolved ? "unsyncs" : "keeps files"}
                    </p>
                  </div>
                  <TerminalSelect
                    aria-label={`Unsync override for ${memberName}`}
                    value={
                      member.vscodeAutoUnsyncOnClose === undefined
                        ? "inherit"
                        : member.vscodeAutoUnsyncOnClose
                          ? "on"
                          : "off"
                    }
                    onChange={(e) =>
                      handleOverrideChange(member.userId, e.target.value)
                    }
                    disabled={savingUserId === member.userId}
                  >
                    <option value="inherit">Inherit</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </TerminalSelect>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>
    </>
  );
}
