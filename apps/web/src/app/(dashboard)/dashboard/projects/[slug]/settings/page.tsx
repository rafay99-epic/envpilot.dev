"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/components/auth";
import {
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalLoading,
  TerminalSelect,
} from "@/components/dashboard/terminal-ui";
import {
  PROJECT_ICONS,
  PROJECT_COLORS,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_COLOR,
} from "@/constants/project";
import { ProjectIcon, FrameworkLogo } from "@/components/ui";
import { PROJECT_TYPES } from "@/constants/templates";
import {
  isFrameworkIcon,
  toFrameworkIcon,
  FRAMEWORK_ICON_TYPES,
} from "@/constants/framework-logos";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useProjectMembers } from "@/hooks/useProjectMembers";
import { sanitizeConvexError } from "@/lib/error-messages";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface ProjectSettingsPageProps {
  params: Promise<{ slug: string }>;
}

interface Project {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  vscodeAutoUnsyncOnClose?: boolean;
  organizationId: string;
  createdAt: number;
  updatedAt: number;
}

export default function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const { slug } = use(params);
  const router = useRouter();
  const { canDo, organization } = useAuthContext();
  const canUpdateProject = canDo("org:create_project");
  const canDeleteProject = canDo("org:delete_project");

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Transfer state
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferConfirmText, setTransferConfirmText] = useState("");
  const [targetOrgId, setTargetOrgId] = useState("");
  const [userOrgs, setUserOrgs] = useState<
    { _id: string; name: string; slug: string }[]
  >([]);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: DEFAULT_PROJECT_ICON,
    color: DEFAULT_PROJECT_COLOR,
  });

  // Tab state
  type ProjectSettingsTab = "general" | "danger";
  const [activeTab, setActiveTab] = useState<ProjectSettingsTab>("general");

  const tabs: { id: ProjectSettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    ...(canDeleteProject
      ? [{ id: "danger" as const, label: "Danger Zone" }]
      : []),
  ];

  // Fetch project data
  useEffect(() => {
    async function fetchProject() {
      try {
        if (!organization?.id) {
          setError("No organization found");
          setIsLoading(false);
          return;
        }

        const projectsResponse = await fetch(
          `/api/projects?organizationId=${organization.id}`
        );
        const projectsData = await projectsResponse.json();

        const foundProject = projectsData.projects?.find(
          (p: Project) => p.slug === slug
        );

        if (!foundProject) {
          setError("Project not found");
        } else {
          setProject(foundProject);
          setFormData({
            name: foundProject.name,
            description: foundProject.description || "",
            icon: foundProject.icon || DEFAULT_PROJECT_ICON,
            color: foundProject.color || DEFAULT_PROJECT_COLOR,
          });
        }
      } catch {
        setError("Failed to load project");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProject();
  }, [organization?.id, slug]);

  // Fetch user's organizations for transfer dropdown
  useEffect(() => {
    async function fetchOrgs() {
      try {
        const response = await fetch("/api/organizations");
        if (response.ok) {
          const data = await response.json();
          const orgs = data.organizations || [];
          // Exclude current org
          setUserOrgs(
            orgs.filter(
              (o: { _id: string }) => o._id !== project?.organizationId
            )
          );
        }
      } catch {
        // Non-critical, ignore
      }
    }
    if (project) fetchOrgs();
  }, [project?.organizationId]);

  const handleTransfer = async () => {
    if (!project || transferConfirmText !== project.name || !targetOrgId)
      return;

    setIsTransferring(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project._id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOrganizationId: targetOrgId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to transfer project");
      }

      router.refresh();
      router.push("/dashboard/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsTransferring(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/projects/${project._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update project");
      }

      setProject(data.project);
      setSuccessMessage("Project updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project || deleteConfirmText !== project.name) return;

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete project");
      }

      router.push("/dashboard/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (error && !project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-500/10 p-3">
          <svg
            className="h-6 w-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-100">{error}</h2>
      </div>
    );
  }

  if (!canUpdateProject) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-500/10 p-3">
          <svg
            className="h-6 w-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-100">
          Access Denied
        </h2>
        <p className="mt-2 text-sm text-zinc-500">
          You do not have permission to manage project settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Project Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage settings for {project?.name}
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
          <div className="space-y-6">
            <GeneralProjectSettings
              project={project!}
              formData={formData}
              setFormData={setFormData}
              isSubmitting={isSubmitting}
              handleSubmit={handleSubmit}
              error={error}
              successMessage={successMessage}
            />
            <VscodeSyncSection
              project={project!}
              onProjectUpdated={setProject}
            />
          </div>
        )}
        {activeTab === "danger" && canDeleteProject && (
          <DangerZoneProjectSettings
            project={project!}
            targetOrgId={targetOrgId}
            setTargetOrgId={setTargetOrgId}
            userOrgs={userOrgs}
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

function GeneralProjectSettings({
  project,
  formData,
  setFormData,
  isSubmitting,
  handleSubmit,
  error,
  successMessage,
}: {
  project: Project;
  formData: { name: string; description: string; icon: string; color: string };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      name: string;
      description: string;
      icon: string;
      color: string;
    }>
  >;
  isSubmitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
  error: string | null;
  successMessage: string | null;
}) {
  const [iconMode, setIconMode] = useState<"framework" | "custom">(
    isFrameworkIcon(formData.icon) ? "framework" : "custom"
  );

  const handleIconModeSwitch = (mode: "framework" | "custom") => {
    setIconMode(mode);
    if (mode === "custom" && isFrameworkIcon(formData.icon)) {
      setFormData((prev) => ({
        ...prev,
        icon: DEFAULT_PROJECT_ICON,
        color: DEFAULT_PROJECT_COLOR,
      }));
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-sm text-green-400">{successMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <TerminalCard>
          <h2 className="text-base font-semibold text-zinc-100">Profile</h2>

          <div className="mt-6 space-y-6">
            {/* Preview */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Preview
              </p>
              <div className="mt-3 flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: isFrameworkIcon(formData.icon)
                      ? "transparent"
                      : formData.color,
                  }}
                >
                  <ProjectIcon
                    icon={formData.icon}
                    size={isFrameworkIcon(formData.icon) ? 36 : 24}
                  />
                </div>
                <div>
                  <p className="font-semibold text-zinc-100">
                    {formData.name || "Project Name"}
                  </p>
                  <p className="text-sm text-zinc-500">{project.slug}</p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Project Name
              </label>
              <TerminalInput
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="My Awesome Project"
                required
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Description <span className="text-zinc-500">(optional)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                placeholder="A brief description of your project..."
              />
            </div>

            {/* Icon Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Icon
              </label>
              <div className="mt-2 mb-3 flex gap-1 rounded-lg bg-zinc-800 p-1">
                <button
                  type="button"
                  onClick={() => handleIconModeSwitch("framework")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    iconMode === "framework"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  Framework Logo
                </button>
                <button
                  type="button"
                  onClick={() => handleIconModeSwitch("custom")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    iconMode === "custom"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  Custom Icon
                </button>
              </div>

              {iconMode === "framework" ? (
                <div className="grid max-h-[280px] grid-cols-4 gap-2 overflow-y-auto">
                  {FRAMEWORK_ICON_TYPES.map((type) => {
                    const isSelected = formData.icon === toFrameworkIcon(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            icon: toFrameworkIcon(type),
                          }))
                        }
                        className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all ${
                          isSelected
                            ? "bg-green-500/20 ring-1 ring-green-500/50"
                            : "bg-zinc-800 hover:bg-zinc-700"
                        }`}
                      >
                        <FrameworkLogo projectType={type} size={20} />
                        <span
                          className={`truncate text-[10px] ${
                            isSelected ? "text-green-400" : "text-zinc-400"
                          }`}
                        >
                          {PROJECT_TYPES[type]?.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {PROJECT_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, icon }))}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all ${
                        formData.icon === icon
                          ? "bg-green-500/20 ring-1 ring-green-500/50"
                          : "bg-zinc-800 hover:bg-zinc-700"
                      }`}
                    >
                      <ProjectIcon
                        icon={icon}
                        size={18}
                        className={
                          formData.icon === icon
                            ? "text-green-400"
                            : "text-zinc-400"
                        }
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Color -- hidden when using framework logo */}
            {!isFrameworkIcon(formData.icon) && (
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  Background Color
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, color }))
                      }
                      className={`h-8 w-8 rounded-lg transition-all ${
                        formData.color === color
                          ? "ring-2 ring-green-400 ring-offset-2 ring-offset-zinc-900"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <TerminalButton
              type="submit"
              disabled={isSubmitting || !formData.name}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </TerminalButton>
          </div>
        </TerminalCard>
      </form>
    </div>
  );
}

// ============================================================
// VS Code Sync (unsync-on-close) — pro-gated
// ============================================================

function VscodeSyncSection({
  project,
  onProjectUpdated,
}: {
  project: Project;
  onProjectUpdated: (project: Project) => void;
}) {
  const { organization } = useAuthContext();

  return (
    <FeatureGate
      organizationId={organization?.id as Id<"organizations"> | undefined}
      featureKey="vscode_unsync_customization"
      featureName="VS Code Unsync Customization"
      fallbackVariant="card"
    >
      <VscodeSyncSectionInner
        project={project}
        onProjectUpdated={onProjectUpdated}
      />
    </FeatureGate>
  );
}

function VscodeSyncSectionInner({
  project,
  onProjectUpdated,
}: {
  project: Project;
  onProjectUpdated: (project: Project) => void;
}) {
  const projectId = project._id as Id<"projects">;
  const { members, isLoading: membersLoading } = useProjectMembers(projectId);
  const setMemberOverride = useMutation(
    api.features.projects.mutations.setMemberUnsyncOverride
  );

  const [enabled, setEnabled] = useState(
    project.vscodeAutoUnsyncOnClose ?? true
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setIsSaving(true);
    setSectionError(null);

    try {
      const response = await fetch(`/api/projects/${project._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vscodeAutoUnsyncOnClose: next }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update setting");
      }
      onProjectUpdated(data.project);
    } catch (err) {
      // Revert on error
      setEnabled(!next);
      setSectionError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOverrideChange = async (
    userId: Id<"users">,
    raw: string // "inherit" | "on" | "off"
  ) => {
    setSavingUserId(userId);
    setSectionError(null);
    try {
      await setMemberOverride({
        projectId,
        userId,
        value: raw === "inherit" ? null : raw === "on",
      });
    } catch (err) {
      setSectionError(sanitizeConvexError(err));
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <TerminalCard>
      <h2 className="text-base font-semibold text-zinc-100">VS Code Sync</h2>

      {sectionError && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{sectionError}</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-zinc-100">Unsync on close</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            When VS Code closes, synced .env files for this project are removed
            from the developer&apos;s machine. Hand-edited files are never
            deleted.
          </p>
        </div>
        <button
          type="button"
          aria-label="Unsync on close"
          aria-pressed={enabled}
          onClick={handleToggle}
          disabled={isSaving}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-green-500" : "bg-zinc-600"
          } ${isSaving ? "opacity-50" : ""}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-zinc-300">Member overrides</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Override the project default for individual members.
        </p>

        {membersLoading ? (
          <p className="mt-3 text-xs text-zinc-600">Loading members...</p>
        ) : members.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-600">
            No members assigned to this project.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {members.map((member) => {
              const memberName =
                member.user?.name || member.user?.email || "Unknown member";
              const resolved = member.vscodeAutoUnsyncOnClose ?? enabled;
              return (
                <li
                  key={member._id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">
                      {memberName}
                    </p>
                    <p className="text-xs text-zinc-500">
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
      </div>
    </TerminalCard>
  );
}

// ============================================================
// Danger Zone Tab
// ============================================================

function DangerZoneProjectSettings({
  project,
  targetOrgId,
  setTargetOrgId,
  userOrgs,
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
  project: Project;
  targetOrgId: string;
  setTargetOrgId: (v: string) => void;
  userOrgs: { _id: string; name: string; slug: string }[];
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
      {/* Transfer Project */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Transfer Project
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Move this project and all its environment variables to another
          organization.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Target Organization
            </label>
            <TerminalSelect
              value={targetOrgId}
              onChange={(e) => setTargetOrgId(e.target.value)}
              className="mt-1 w-full"
            >
              <option value="">Select an organization...</option>
              {userOrgs.map((org) => (
                <option key={org._id} value={org._id}>
                  {org.name}
                </option>
              ))}
            </TerminalSelect>
            {userOrgs.length === 0 && (
              <p className="mt-1 text-xs text-zinc-600">
                You need to be a member of another organization to transfer.
              </p>
            )}
          </div>

          {showTransferConfirm && targetOrgId ? (
            <div className="space-y-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-zinc-100">
                Type{" "}
                <span className="font-mono font-semibold">{project.name}</span>{" "}
                to confirm transfer:
              </p>
              <TerminalInput
                type="text"
                value={transferConfirmText}
                onChange={(e) => setTransferConfirmText(e.target.value)}
                placeholder="Project name"
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
                    transferConfirmText !== project.name || isTransferring
                  }
                >
                  {isTransferring ? "Transferring..." : "Transfer Project"}
                </TerminalButton>
              </div>
            </div>
          ) : (
            <TerminalButton
              variant="danger"
              onClick={() => setShowTransferConfirm(true)}
              disabled={!targetOrgId}
            >
              Transfer Project
            </TerminalButton>
          )}
        </div>
      </TerminalCard>

      {/* Delete Project */}
      <TerminalCard className="border-red-500/30">
        <h2 className="text-base font-semibold text-red-400">Delete Project</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Once you delete a project, it cannot be restored. Its variables and
          shared accounts follow the same 7-day retention before permanent
          deletion, including the stored secret values.
        </p>

        {showDeleteConfirm && project ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-zinc-100">
              Type{" "}
              <span className="font-mono font-semibold">{project.name}</span> to
              confirm deletion:
            </p>
            <TerminalInput
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={project.name}
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
                disabled={isDeleting || deleteConfirmText !== project.name}
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </TerminalButton>
            </div>
          </div>
        ) : (
          <TerminalButton
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
            className="mt-4"
          >
            Delete Project
          </TerminalButton>
        )}
      </TerminalCard>
    </div>
  );
}
