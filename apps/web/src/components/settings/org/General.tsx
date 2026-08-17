"use client";

import { useState } from "react";
import { SaveBar, SettingsField, SettingsSection } from "@envpilot/ui";
import { SectionProvenance } from "@/components/settings/SectionProvenance";
import {
  TerminalBadge,
  TerminalButtonLink,
  TerminalInput,
} from "@/components/dashboard/terminal-ui";
import { useUnsavedChanges } from "@/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";

// A type alias, not an interface: only aliases get the implicit index
// signature `useUnsavedChanges<T extends Record<string, unknown>>` needs.
type ProfileValues = {
  name: string;
  description: string;
};

export function GeneralTab({
  organization,
  orgTier,
}: {
  organization: {
    _id: string;
    name: string;
    slug: string;
    description?: string;
  };
  orgTier: string;
}) {
  const updateOrganization = useMutation(
    api.features.organizations.mutations.update
  );
  const [values, setValues] = useState<ProfileValues>({
    name: "",
    description: "",
  });
  const [snapshot, setSnapshot] = useState<ProfileValues | null>(null);
  const [seededOrganizationId, setSeededOrganizationId] = useState<
    string | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Seed once per organization: the query is reactive, so re-seeding on every
  // result would discard in-flight edits when someone else writes.
  //
  // Adjusted DURING render rather than in an effect. This is the documented
  // shape for "reset state when a prop changes": React re-runs the component
  // immediately without committing the first pass, so it costs less than the
  // extra render an effect would schedule, and the form is never briefly
  // shown with the previous organization's values.
  if (seededOrganizationId !== organization._id) {
    const seeded = {
      name: organization.name,
      description: organization.description || "",
    };
    setSeededOrganizationId(organization._id);
    setValues(seeded);
    setSnapshot(seeded);
  }

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
      await updateOrganization({
        organizationId: organization._id as Id<"organizations">,
        name: sent.name,
        description: sent.description || undefined,
      });

      setSnapshot(sent);
      setSuccessMessage("Organization settings updated successfully");
    } catch (err) {
      setError(sanitizeConvexError(err) || "An error occurred");
    }
    // After the try/catch, not in a `finally`: React Compiler bails on the
    // whole component when a try carries a finalizer. The catch swallows, so
    // this clears on both paths.
    setIsSaving(false);
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
