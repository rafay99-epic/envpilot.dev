"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
  TerminalButtonLink,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  tier: "free" | "pro";
  role: "admin" | "team_lead" | "member";
  settings?: {
    teamLeadsCanCreateProjects: boolean;
  };
}

type OrgSettingsTab = "general" | "access" | "danger";

export default function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamLeadsCanCreateProjects, setTeamLeadsCanCreateProjects] =
    useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Transfer state
  const [transferEmail, setTransferEmail] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferConfirmText, setTransferConfirmText] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<OrgSettingsTab>("general");

  const tabs: { id: OrgSettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "access", label: "Access Control" },
    { id: "danger", label: "Danger Zone" },
  ];

  useEffect(() => {
    async function fetchOrganization() {
      try {
        const response = await fetch(`/api/organizations/${slug}`);
        if (!response.ok) {
          if (response.status === 403) {
            throw new Error("You do not have permission to access this page");
          }
          throw new Error("Failed to fetch organization");
        }
        const data = await response.json();
        setOrganization(data.organization);
        setName(data.organization.name);
        setDescription(data.organization.description || "");
        setTeamLeadsCanCreateProjects(
          data.organization.settings?.teamLeadsCanCreateProjects ?? true
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchOrganization();
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/organizations/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update organization");
      }

      const data = await response.json();
      setOrganization({ ...organization!, ...data.organization });
      setSuccessMessage("Organization settings updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmText !== organization?.name) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${slug}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete organization");
      }

      router.push("/organizations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsDeleting(false);
    }
  }

  async function handleTransfer() {
    if (transferConfirmText !== organization?.name || !transferEmail) return;

    setIsTransferring(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${slug}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserEmail: transferEmail }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to transfer organization");
      }

      router.refresh();
      router.push("/organizations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsTransferring(false);
    }
  }

  async function handleToggleAccess() {
    const newValue = !teamLeadsCanCreateProjects;
    setTeamLeadsCanCreateProjects(newValue);
    setIsSavingSettings(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${slug}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            teamLeadsCanCreateProjects: newValue,
          },
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update settings");
      }
      setSuccessMessage("Access control settings updated");
    } catch (err) {
      setTeamLeadsCanCreateProjects(!newValue);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSavingSettings(false);
    }
  }

  if (isLoading) {
    return <TerminalLoading />;
  }

  if (error && !organization) {
    return (
      <div className="mx-auto max-w-2xl">
        <TerminalCard className="border-red-500/30">
          <p className="text-red-400">{error}</p>
          <Link
            href="/organizations"
            className="mt-4 inline-flex items-center gap-1 text-sm text-red-400 hover:underline"
          >
            Back to Organizations
          </Link>
        </TerminalCard>
      </div>
    );
  }

  if (organization?.role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl">
        <TerminalCard className="border-amber-500/30">
          <h3 className="font-semibold text-amber-400">Permission Denied</h3>
          <p className="mt-1 text-sm text-amber-400/80">
            Only organization admins can access settings.
          </p>
          <Link
            href={`/organizations/${slug}`}
            className="mt-4 inline-flex items-center gap-1 text-sm text-amber-400 hover:underline"
          >
            Back to Organization
          </Link>
        </TerminalCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">
          Organization Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your organization settings and preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-green-400 text-green-400"
                  : "border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl">
        {activeTab === "general" && (
          <GeneralOrgSettings
            organization={organization!}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            isSaving={isSaving}
            handleSave={handleSave}
            error={error}
            successMessage={successMessage}
          />
        )}
        {activeTab === "access" && (
          <AccessControlSettings
            teamLeadsCanCreateProjects={teamLeadsCanCreateProjects}
            isSavingSettings={isSavingSettings}
            onToggle={handleToggleAccess}
          />
        )}
        {activeTab === "danger" && (
          <DangerZoneSettings
            organization={organization!}
            transferEmail={transferEmail}
            setTransferEmail={setTransferEmail}
            showTransferConfirm={showTransferConfirm}
            setShowTransferConfirm={setShowTransferConfirm}
            transferConfirmText={transferConfirmText}
            setTransferConfirmText={setTransferConfirmText}
            isTransferring={isTransferring}
            handleTransfer={handleTransfer}
            showDeleteConfirm={showDeleteConfirm}
            setShowDeleteConfirm={setShowDeleteConfirm}
            deleteConfirmText={deleteConfirmText}
            setDeleteConfirmText={setDeleteConfirmText}
            isDeleting={isDeleting}
            handleDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// General Tab
// ============================================================

function GeneralOrgSettings({
  organization,
  name,
  setName,
  description,
  setDescription,
  isSaving,
  handleSave,
  error,
  successMessage,
}: {
  organization: Organization;
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  isSaving: boolean;
  handleSave: (e: React.FormEvent) => void;
  error: string | null;
  successMessage: string | null;
}) {
  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-sm text-green-400">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSave}>
        <TerminalCard>
          <h2 className="text-base font-semibold text-zinc-100">Profile</h2>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Organization Name
              </label>
              <TerminalInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="mt-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                URL Slug
              </label>
              <TerminalInput
                type="text"
                value={organization.slug}
                disabled
                className="mt-1 cursor-not-allowed opacity-50"
              />
              <p className="mt-1 text-xs text-zinc-600">
                Slug cannot be changed after creation.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-1 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <TerminalButton type="submit" disabled={isSaving || !name}>
              {isSaving ? "Saving..." : "Save Changes"}
            </TerminalButton>
          </div>
        </TerminalCard>
      </form>

      {/* Plan Info */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">Plan</h2>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <TerminalBadge
              color={organization.tier === "pro" ? "green" : "zinc"}
            >
              {organization.tier === "pro" ? "Pro Plan" : "Free Plan"}
            </TerminalBadge>
            <p className="mt-2 text-sm text-zinc-500">
              View your resource usage and available features on the Usage &amp;
              Plan page.
            </p>
          </div>
          <TerminalButtonLink
            href="/dashboard/usage"
            variant="secondary"
            className="shrink-0"
          >
            View Usage
          </TerminalButtonLink>
        </div>
      </TerminalCard>
    </div>
  );
}

// ============================================================
// Access Control Tab
// ============================================================

function AccessControlSettings({
  teamLeadsCanCreateProjects,
  isSavingSettings,
  onToggle,
}: {
  teamLeadsCanCreateProjects: boolean;
  isSavingSettings: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-6">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Access Control
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Control what team leads can do in your organization.
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-100">
                Allow team leads to create projects
              </p>
              <p className="text-xs text-zinc-500">
                When disabled, only admins can create new projects.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={teamLeadsCanCreateProjects}
              onClick={onToggle}
              disabled={isSavingSettings}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                teamLeadsCanCreateProjects ? "bg-green-500" : "bg-zinc-600"
              } ${isSavingSettings ? "opacity-50" : ""}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  teamLeadsCanCreateProjects ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </TerminalCard>
    </div>
  );
}

// ============================================================
// Danger Zone Tab
// ============================================================

function DangerZoneSettings({
  organization,
  transferEmail,
  setTransferEmail,
  showTransferConfirm,
  setShowTransferConfirm,
  transferConfirmText,
  setTransferConfirmText,
  isTransferring,
  handleTransfer,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteConfirmText,
  setDeleteConfirmText,
  isDeleting,
  handleDelete,
}: {
  organization: Organization;
  transferEmail: string;
  setTransferEmail: (v: string) => void;
  showTransferConfirm: boolean;
  setShowTransferConfirm: (v: boolean) => void;
  transferConfirmText: string;
  setTransferConfirmText: (v: string) => void;
  isTransferring: boolean;
  handleTransfer: () => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (v: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (v: string) => void;
  isDeleting: boolean;
  handleDelete: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Transfer Ownership */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Transfer Ownership
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Transfer this organization to another user. They will become the admin
          and all current members will be removed.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              New Owner&apos;s Email
            </label>
            <TerminalInput
              type="email"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              placeholder="Enter new owner's email"
              className="mt-1"
            />
          </div>

          {showTransferConfirm && transferEmail ? (
            <div className="space-y-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="text-sm">
                <p className="font-medium text-red-400">
                  This action cannot be undone.
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-400">
                  <li>New owner becomes admin</li>
                  <li>You will be removed from the organization</li>
                  <li>All other members retain their roles and access</li>
                  <li>All projects, variables, and settings stay intact</li>
                </ul>
              </div>
              <p className="text-sm text-zinc-100">
                Type{" "}
                <span className="font-mono font-semibold">
                  {organization.name}
                </span>{" "}
                to confirm:
              </p>
              <TerminalInput
                type="text"
                value={transferConfirmText}
                onChange={(e) => setTransferConfirmText(e.target.value)}
                placeholder="Organization name"
              />
              <div className="flex gap-3">
                <TerminalButton
                  variant="secondary"
                  onClick={() => {
                    setShowTransferConfirm(false);
                    setTransferConfirmText("");
                  }}
                >
                  Cancel
                </TerminalButton>
                <TerminalButton
                  variant="danger"
                  onClick={handleTransfer}
                  disabled={
                    transferConfirmText !== organization.name || isTransferring
                  }
                >
                  {isTransferring ? "Transferring..." : "Transfer Ownership"}
                </TerminalButton>
              </div>
            </div>
          ) : (
            <TerminalButton
              variant="danger"
              onClick={() => setShowTransferConfirm(true)}
              disabled={!transferEmail}
            >
              Transfer Ownership
            </TerminalButton>
          )}
        </div>
      </TerminalCard>

      {/* Delete Organization */}
      <TerminalCard className="border-red-500/30">
        <h2 className="text-base font-semibold text-red-400">Danger Zone</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Once you delete an organization, there is no going back. All projects,
          environment variables, and team data will be permanently removed.
        </p>

        {showDeleteConfirm ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-zinc-100">
              Type{" "}
              <span className="font-mono font-semibold">
                {organization.name}
              </span>{" "}
              to confirm deletion:
            </p>
            <TerminalInput
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Organization name"
            />
            <div className="flex gap-3">
              <TerminalButton
                variant="secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
              >
                Cancel
              </TerminalButton>
              <TerminalButton
                variant="danger"
                onClick={handleDelete}
                disabled={deleteConfirmText !== organization.name || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Organization"}
              </TerminalButton>
            </div>
          </div>
        ) : (
          <TerminalButton
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-4"
          >
            Delete Organization
          </TerminalButton>
        )}
      </TerminalCard>
    </div>
  );
}
