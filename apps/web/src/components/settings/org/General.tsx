"use client";

import { useEffect, useRef, useState } from "react";
import { SaveBar, SettingsField, SettingsSection } from "@envpilot/ui";
import { SectionProvenance } from "@/components/settings/SectionProvenance";
import {
  TerminalBadge,
  TerminalButtonLink,
  TerminalInput,
} from "@/components/dashboard/terminal-ui";
import { useUnsavedChanges } from "@/hooks";

// A type alias, not an interface: only aliases get the implicit index
// signature `useUnsavedChanges<T extends Record<string, unknown>>` needs.
type ProfileValues = {
  name: string;
  description: string;
};

export function GeneralTab({
  slug,
  organization,
  orgTier,
}: {
  slug: string;
  organization: {
    _id: string;
    name: string;
    slug: string;
    description?: string;
  };
  orgTier: string;
}) {
  const [values, setValues] = useState<ProfileValues>({
    name: "",
    description: "",
  });
  const [snapshot, setSnapshot] = useState<ProfileValues | null>(null);
  const seededOrganizationId = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Seed once per organization: the query is reactive, so re-seeding on every
  // result would discard in-flight edits when someone else writes.
  useEffect(() => {
    if (seededOrganizationId.current === organization._id) return;
    seededOrganizationId.current = organization._id;
    const seeded = {
      name: organization.name,
      description: organization.description || "",
    };
    setValues(seeded);
    setSnapshot(seeded);
  }, [organization]);

  const { dirtyCount } = useUnsavedChanges(values, snapshot);

  async function handleSave() {
    if (!values.name.trim()) {
      setError("Organization name is required");
      return;
    }
    // Freeze what is being sent: edits typed while the request is in flight
    // must stay dirty rather than be snapshotted as saved.
    const sent = values;
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/organizations/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sent.name,
          description: sent.description || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update organization");
      }

      setSnapshot(sent);
      setSuccessMessage("Organization settings updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <SettingsSection
        title="Profile"
        description="How this organization is named across the dashboard, CLI and API."
        aside={
          <SectionProvenance
            organizationId={organization._id}
            action="org.updated"
          />
        }
      >
        <SettingsField label="Organization name" htmlFor="org-name">
          <TerminalInput
            id="org-name"
            type="text"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            required
            maxLength={100}
          />
        </SettingsField>

        <SettingsField
          label="URL slug"
          htmlFor="org-slug"
          hint="Slug cannot be changed after creation."
        >
          <TerminalInput
            id="org-slug"
            type="text"
            value={organization.slug}
            disabled
            className="cursor-not-allowed opacity-50"
          />
        </SettingsField>

        <SettingsField label="Description" htmlFor="org-description">
          <textarea
            id="org-description"
            value={values.description}
            onChange={(e) =>
              setValues({ ...values, description: e.target.value })
            }
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-panel border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-subtle transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="Plan"
        description="Resource usage and available features live on the Usage & Plan page."
        aside={
          <TerminalBadge color={orgTier === "pro" ? "green" : "zinc"}>
            {orgTier === "pro" ? "Pro plan" : "Free plan"}
          </TerminalBadge>
        }
      >
        <div>
          <TerminalButtonLink href="/dashboard/usage" variant="secondary">
            View usage
          </TerminalButtonLink>
        </div>
      </SettingsSection>

      {successMessage && (
        <p className="border-t border-line py-3 font-mono text-[12px] text-accent">
          ✓ {successMessage}
        </p>
      )}

      <SaveBar
        dirtyCount={dirtyCount}
        saving={isSaving}
        error={error}
        onSave={handleSave}
        onDiscard={() => {
          if (snapshot) setValues(snapshot);
          setError(null);
        }}
      />
    </div>
  );
}
