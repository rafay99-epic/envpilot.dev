"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RequireRole, useAuthContext } from "@/components/auth";
import {
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
  TerminalButtonLink,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { Pencil, Trash2, Plus, ListPlus, X, Loader2 } from "lucide-react";
import {
  useOrganizationTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  type Tag as TagType,
  useConvexUser,
} from "@/hooks";
import { useFeatureGate, usePagination } from "@/hooks";
import { normalizeOrgRole } from "@/lib/roles";

interface Organization {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  role: string;
}

type OrgSettingsTab = "general" | "tags" | "danger";

export default function OrganizationSettingsPage(props: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <RequireRole minimum="owner">
      <OrganizationSettingsPageContent {...props} />
    </RequireRole>
  );
}

function OrganizationSettingsPageContent({
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

  // Transfer state
  const [transferEmail, setTransferEmail] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferConfirmText, setTransferConfirmText] = useState("");

  // Tab state — support ?tab=tags deep link
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as OrgSettingsTab) || "general";
  const [activeTab, setActiveTab] = useState<OrgSettingsTab>(initialTab);

  // Feature gate for tags
  const { allowed: showTags } = useFeatureGate(
    organization?._id as Id<"organizations"> | undefined,
    "variable_tags"
  );

  // Look up tier from organizationTiers table
  const tierData = useQuery(
    api.featureRegistry.getResolvedFeatures,
    organization?._id
      ? { organizationId: organization._id as Id<"organizations"> }
      : "skip"
  );
  const orgTier = (tierData?.tierName as string) ?? "free";

  const tabs: { id: OrgSettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    ...(showTags ? [{ id: "tags" as const, label: "Tags" }] : []),
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

  if (isLoading) {
    return <TerminalLoading fullPage />;
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

  if (!organization || normalizeOrgRole(organization.role) !== "owner") {
    return (
      <div className="mx-auto max-w-2xl">
        <TerminalCard className="border-amber-500/30">
          <h3 className="font-semibold text-amber-400">Permission Denied</h3>
          <p className="mt-1 text-sm text-amber-400/80">
            Only organization owners can access settings.
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
            orgTier={orgTier}
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
        {activeTab === "tags" && showTags && organization && (
          <TagSettingsTab organizationId={organization._id as string} />
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
  orgTier,
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
  orgTier: string;
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
            <TerminalBadge color={orgTier === "pro" ? "green" : "zinc"}>
              {orgTier === "pro" ? "Pro Plan" : "Free Plan"}
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
          Transfer this organization to another user. They will become the owner
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
                  <li>New owner takes over the organization</li>
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
          Once you delete an organization, there is no going back. All projects
          and team data will be permanently removed; its environment variables
          and shared accounts follow the same 7-day retention before permanent
          deletion, including the stored secret values.
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

// ============================================================
// Tags Tab
// ============================================================

const TAG_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

function TagSettingsTab({ organizationId }: { organizationId: string }) {
  const { tags, isLoading } = useOrganizationTags(organizationId);
  const isFetchError = false; // Convex handles errors via error boundaries
  const createTagMut = useCreateTag();
  const updateTagMut = useUpdateTag();
  const deleteTagMut = useDeleteTag();

  // Get Convex user ID for mutation `createdBy`/`updatedBy`/`deletedBy` fields
  const { user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);

  // UI state
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bulk paste state
  const [bulkText, setBulkText] = useState("");
  const [bulkEntries, setBulkEntries] = useState<
    Array<{ name: string; color: string }>
  >([]);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    completed: number;
    failures: Array<{ name: string; error: string }>;
  } | null>(null);

  // Notification state with auto-dismiss
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagSuccess, setTagSuccess] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setTagError(msg);
    setTagSuccess(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setTagError(null), 5000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setTagSuccess(msg);
    setTagError(null);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setTagSuccess(null), 3000);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Pagination (20 per page — tags are lightweight)
  const pagination = usePagination(tags, { pageSize: 20 });

  const extractErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    return fallback;
  };

  // Bulk paste parsing — accepts comma, semicolon, or newline separated names
  const parseBulkText = useCallback(
    (text: string) => {
      const names = text
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 50);

      // Deduplicate (case-insensitive) and remove names that already exist
      const existingNames = new Set(tags.map((t) => t.name.toLowerCase()));
      const seen = new Set<string>();
      const entries: Array<{ name: string; color: string }> = [];

      for (const name of names) {
        const lower = name.toLowerCase();
        if (seen.has(lower) || existingNames.has(lower)) continue;
        seen.add(lower);
        // Round-robin assign colors from the palette
        entries.push({
          name,
          color: TAG_COLORS[entries.length % TAG_COLORS.length],
        });
      }

      return entries;
    },
    [tags]
  );

  const handleBulkTextChange = useCallback(
    (text: string) => {
      setBulkText(text);
      setBulkEntries(parseBulkText(text));
    },
    [parseBulkText]
  );

  const removeBulkEntry = (name: string) => {
    setBulkEntries((prev) => prev.filter((e) => e.name !== name));
  };

  const handleBulkCreate = async () => {
    if (bulkEntries.length === 0) return;

    setIsBulkCreating(true);
    const progress = {
      total: bulkEntries.length,
      completed: 0,
      failures: [] as Array<{ name: string; error: string }>,
    };
    setBulkProgress(progress);

    for (const entry of bulkEntries) {
      try {
        await createTagMut.mutateAsync({
          organizationId,
          name: entry.name,
          color: entry.color,
          createdBy: convexUserId as string,
        });
        progress.completed++;
      } catch (err) {
        progress.completed++;
        progress.failures.push({
          name: entry.name,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
      setBulkProgress({ ...progress });
    }

    setIsBulkCreating(false);
    setBulkProgress(null);

    const successCount = progress.total - progress.failures.length;
    if (progress.failures.length === 0) {
      showSuccess(
        `${successCount} tag${successCount !== 1 ? "s" : ""} created`
      );
      setBulkText("");
      setBulkEntries([]);
      setShowBulkPaste(false);
    } else if (successCount > 0) {
      showSuccess(
        `${successCount} created, ${progress.failures.length} failed`
      );
      // Keep the form open with only the failed entries visible
      setBulkEntries(
        bulkEntries.filter((e) =>
          progress.failures.some((f) => f.name === e.name)
        )
      );
    } else {
      showError("All tags failed to create. Check the errors below.");
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) {
      showError("Tag name must be 50 characters or less");
      return;
    }
    try {
      await createTagMut.mutateAsync({
        organizationId,
        name: trimmed,
        color: newColor,
        createdBy: convexUserId as string,
      });
      setNewName("");
      setNewColor(TAG_COLORS[0]);
      setShowCreate(false);
      showSuccess(`Tag "${trimmed}" created`);
    } catch (err) {
      showError(extractErrorMessage(err, "Failed to create tag"));
    }
  };

  const handleUpdate = async (tagId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) {
      showError("Tag name must be 50 characters or less");
      return;
    }
    try {
      await updateTagMut.mutateAsync({
        tagId,
        name: trimmed,
        color: editColor,
        updatedBy: convexUserId as string,
      });
      setEditingId(null);
      showSuccess(`Tag updated to "${trimmed}"`);
    } catch (err) {
      showError(extractErrorMessage(err, "Failed to update tag"));
    }
  };

  const handleDelete = async (tagId: string) => {
    const tagName = tags.find((t) => t._id === tagId)?.name ?? "Tag";
    try {
      await deleteTagMut.mutateAsync({
        tagId,
        deletedBy: convexUserId as string,
      });
      setDeletingId(null);
      showSuccess(`Tag "${tagName}" deleted`);
    } catch (err) {
      showError(extractErrorMessage(err, "Failed to delete tag"));
    }
  };

  const startEdit = (tag: TagType) => {
    setEditingId(tag._id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  if (isLoading) {
    return <TerminalLoading />;
  }

  if (isFetchError) {
    return (
      <TerminalCard className="border-red-500/30">
        <p className="text-sm text-red-400">
          Failed to load tags. Please try again.
        </p>
        <TerminalButton
          variant="secondary"
          onClick={() => window.location.reload()}
          className="mt-3"
        >
          Retry
        </TerminalButton>
      </TerminalCard>
    );
  }

  return (
    <div className="space-y-6">
      {tagError && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{tagError}</p>
          <button
            onClick={() => setTagError(null)}
            className="ml-4 shrink-0 text-xs text-red-400/60 hover:text-red-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {tagSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <p className="text-sm text-green-400">{tagSuccess}</p>
          <button
            onClick={() => setTagSuccess(null)}
            className="ml-4 shrink-0 text-xs text-green-400/60 hover:text-green-400"
          >
            Dismiss
          </button>
        </div>
      )}

      <TerminalCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Variable Tags
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Create and manage tags to organize your environment variables.
              {tags.length > 0 && (
                <span className="ml-1 text-zinc-600">
                  ({tags.length} tag{tags.length !== 1 ? "s" : ""})
                </span>
              )}
            </p>
          </div>
          {!showCreate && !showBulkPaste && (
            <div className="flex gap-2">
              <TerminalButton
                variant="secondary"
                onClick={() => {
                  setShowBulkPaste(true);
                  setShowCreate(false);
                }}
              >
                <ListPlus className="h-4 w-4" />
                Bulk Add
              </TerminalButton>
              <TerminalButton
                onClick={() => {
                  setShowCreate(true);
                  setShowBulkPaste(false);
                }}
              >
                <Plus className="h-4 w-4" />
                New Tag
              </TerminalButton>
            </div>
          )}
        </div>

        {/* Bulk paste form */}
        {showBulkPaste && (
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Paste tag names
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Separate with commas, semicolons, or newlines. Duplicates and
                existing tags are skipped.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => handleBulkTextChange(e.target.value)}
                placeholder={`Database, AWS, API Keys\nFrontend, Backend, Auth\nCache; Storage; Monitoring`}
                rows={4}
                className="mt-2 block w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                disabled={isBulkCreating}
                autoFocus
              />
              {bulkText.trim() && (
                <p className="mt-1 text-xs text-zinc-500">
                  {bulkEntries.length} new tag
                  {bulkEntries.length !== 1 ? "s" : ""} to create
                  {bulkEntries.length === 0 &&
                    bulkText.trim().length > 0 &&
                    " (all names already exist or are duplicates)"}
                </p>
              )}
            </div>

            {/* Preview with color dots and remove buttons */}
            {bulkEntries.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-zinc-400">
                  Preview
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bulkEntries.map((entry) => (
                    <span
                      key={entry.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 py-0.5 pl-2 pr-1 text-xs text-zinc-200"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      {entry.name}
                      <button
                        type="button"
                        onClick={() => removeBulkEntry(entry.name)}
                        disabled={isBulkCreating}
                        className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Progress */}
            {bulkProgress && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-green-400" />
                <span className="text-sm text-zinc-300">
                  Creating {bulkProgress.completed}/{bulkProgress.total}...
                </span>
                {bulkProgress.failures.length > 0 && (
                  <span className="text-sm text-red-400">
                    ({bulkProgress.failures.length} failed)
                  </span>
                )}
              </div>
            )}

            {/* Bulk failure details */}
            {bulkProgress &&
              bulkProgress.failures.length > 0 &&
              !isBulkCreating && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                  <p className="text-xs font-medium text-red-400">
                    Failed tags:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {bulkProgress.failures.map((f, i) => (
                      <li key={i} className="text-xs text-red-400/80">
                        {f.name}: {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            <div className="flex justify-end gap-2">
              <TerminalButton
                variant="secondary"
                onClick={() => {
                  setShowBulkPaste(false);
                  setBulkText("");
                  setBulkEntries([]);
                  setBulkProgress(null);
                }}
                disabled={isBulkCreating}
              >
                Cancel
              </TerminalButton>
              <TerminalButton
                onClick={handleBulkCreate}
                disabled={bulkEntries.length === 0 || isBulkCreating}
              >
                {isBulkCreating
                  ? `Creating ${bulkProgress?.completed ?? 0}/${bulkProgress?.total ?? 0}...`
                  : `Create ${bulkEntries.length} Tag${bulkEntries.length !== 1 ? "s" : ""}`}
              </TerminalButton>
            </div>
          </div>
        )}

        {/* Inline create form */}
        {showCreate && (
          <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <div className="flex items-center gap-3">
              <TerminalInput
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tag name"
                maxLength={50}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                  if (e.key === "Escape") setShowCreate(false);
                }}
                autoFocus
              />
              <div className="flex gap-1">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      newColor === color
                        ? "scale-110 border-white"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <TerminalButton
                variant="secondary"
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                }}
              >
                Cancel
              </TerminalButton>
              <TerminalButton
                onClick={handleCreate}
                disabled={!newName.trim() || createTagMut.isPending}
              >
                {createTagMut.isPending ? "Creating..." : "Create Tag"}
              </TerminalButton>
            </div>
          </div>
        )}

        {/* Tags list */}
        <div className="mt-6">
          {tags.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              No tags yet. Create your first tag to start organizing variables.
            </p>
          ) : (
            <>
              <div className="divide-y divide-zinc-800">
                {pagination.pageItems.map((tag) => (
                  <div key={tag._id} className="flex items-center gap-3 py-3">
                    {editingId === tag._id ? (
                      <>
                        <div className="flex flex-1 items-center gap-3">
                          <TerminalInput
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={50}
                            className="flex-1"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleUpdate(tag._id);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                          />
                          <div className="flex gap-1">
                            {TAG_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setEditColor(color)}
                                className={`h-5 w-5 rounded-full border-2 transition-transform ${
                                  editColor === color
                                    ? "scale-110 border-white"
                                    : "border-transparent hover:scale-105"
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <TerminalButton
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </TerminalButton>
                          <TerminalButton
                            onClick={() => handleUpdate(tag._id)}
                            disabled={
                              !editName.trim() || updateTagMut.isPending
                            }
                          >
                            {updateTagMut.isPending ? "Saving..." : "Save"}
                          </TerminalButton>
                        </div>
                      </>
                    ) : deletingId === tag._id ? (
                      <>
                        <div className="flex-1">
                          <p className="text-sm text-red-400">
                            Delete &ldquo;{tag.name}&rdquo;? This will remove it
                            from all variables.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <TerminalButton
                            variant="secondary"
                            onClick={() => setDeletingId(null)}
                          >
                            Cancel
                          </TerminalButton>
                          <TerminalButton
                            variant="danger"
                            onClick={() => handleDelete(tag._id)}
                            disabled={deleteTagMut.isPending}
                          >
                            {deleteTagMut.isPending ? "Deleting..." : "Delete"}
                          </TerminalButton>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-zinc-100">
                            {tag.name}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => startEdit(tag)}
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
                            title="Edit tag"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingId(tag._id)}
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                            title="Delete tag"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {pagination.totalPages > 1 && (
                <Pagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  hasNextPage={pagination.hasNextPage}
                  hasPrevPage={pagination.hasPrevPage}
                  onNextPage={pagination.nextPage}
                  onPrevPage={pagination.prevPage}
                  onGoToPage={pagination.goToPage}
                  startIndex={pagination.startIndex}
                  endIndex={pagination.endIndex}
                  totalItems={pagination.totalItems}
                />
              )}
            </>
          )}
        </div>
      </TerminalCard>
    </div>
  );
}
