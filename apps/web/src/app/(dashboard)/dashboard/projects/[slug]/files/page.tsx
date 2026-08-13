"use client";

import { useState, use } from "react";
import { FileKey, Plus } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useProjectBySlug, useConvexUser } from "@/hooks";
import {
  useSecretFiles,
  useSecretFileUploadQuota,
  useUploadSecretFile,
  useUpdateSecretFile,
  useDeleteSecretFile,
  useGetSecretFileContent,
  fileToBase64,
  downloadBase64,
  type SecretFile,
} from "@/hooks/useSecretFiles";
import {
  FileListItem,
  FileFormDrawer,
  FilePermissionsDrawer,
  type FileFormData,
} from "@/components/files";
import { ENVIRONMENTS } from "@/constants/project";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/dashboard/project-files");

interface FilesPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Project → Files.
 *
 * Secret files are the artifacts that are not strings: keystores, SSH keys,
 * service-account JSON, provisioning profiles. Each carries a destination
 * path and a POSIX mode, so `envpilot pull`, the VS Code extension, and CI
 * put it exactly where the build expects without anyone remembering.
 *
 * Contents are never rendered here — download only, and every download is
 * audited server-side.
 */
export default function ProjectFilesPage({ params }: FilesPageProps) {
  const { slug } = use(params);
  const { organization, user, capabilities } = useAuthContext();

  // Registry capabilities (getMyPermissions). The server re-checks every
  // mutation — these only decide what the UI offers.
  const canCreate = capabilities["project.files.create"] === true;
  const canUpdate = capabilities["project.files.update"] === true;
  const canDelete = capabilities["project.files.delete"] === true;
  const canManagePermissions =
    capabilities["project.permissions.manage"] === true;

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectId = project?._id as Id<"projects"> | undefined;

  const files = useSecretFiles(projectId);
  const isLoadingFiles = files === undefined;

  const uploadFile = useUploadSecretFile();
  const updateFile = useUpdateSecretFile();
  const deleteFile = useDeleteSecretFile();
  const getFileContent = useGetSecretFileContent();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState("all");
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [editingFile, setEditingFile] = useState<SecretFile | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [deletingFile, setDeletingFile] = useState<SecretFile | null>(null);
  const [permissionsFile, setPermissionsFile] = useState<SecretFile | null>(
    null
  );
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const fileList = files ?? [];
  // Server-computed and ORG-wide. A project-local count would leave Upload
  // enabled while a sibling project already consumed the org's slots, so the
  // click failed on a server error instead of the button being disabled.
  const quota = useSecretFileUploadQuota(projectId);
  const canCreateGate = quota === undefined ? true : quota.allowed;

  const filteredFiles = fileList.filter(
    (f) =>
      selectedEnvironment === "all" ||
      f.environments.includes(selectedEnvironment)
  );

  const closeDrawers = () => {
    setShowCreateDrawer(false);
    setEditingFile(null);
    setReplaceMode(false);
  };

  const handleSubmit = async (data: FileFormData) => {
    if (!projectId) return;
    // Clear both, so a stale failure banner cannot sit alongside a later
    // success (or vice versa).
    setError(null);
    setNotice(null);

    if (editingFile && !replaceMode) {
      await updateFile({
        fileId: editingFile._id,
        name: data.name,
        path: data.path,
        mode: data.mode,
        description: data.description,
        environments: data.environments,
      });
      setNotice(`Updated ${data.name}`);
    } else {
      if (!data.file) throw new Error("Choose a file to upload");
      const content = await fileToBase64(data.file);
      await uploadFile({
        projectId,
        name: data.name,
        path: data.path,
        mode: data.mode,
        content,
        contentType: data.file.type || undefined,
        description: data.description || undefined,
        environments: data.environments,
        replaceFileId: replaceMode ? editingFile?._id : undefined,
      });
      setNotice(
        replaceMode
          ? `Replaced contents of ${editingFile?.name}`
          : `Uploaded ${data.name}`
      );
    }
    closeDrawers();
  };

  const handleDownload = async (file: SecretFile) => {
    setDownloadingIds((prev) => new Set(prev).add(file._id));
    setError(null);
    setNotice(null);
    try {
      const result = await getFileContent({ fileId: file._id, source: "web" });
      // Name the download after the path's basename, not the display name —
      // the build expects the filename, not "Android Upload Keystore".
      const basename = result.path.split("/").pop() || result.name;
      downloadBase64(result.content, basename, result.contentType);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not download the file";
      log.error("secret file download failed", { message });
      setError(message);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(file._id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingFile) return;
    setError(null);
    setNotice(null);
    try {
      await deleteFile({ fileId: deletingFile._id });
      setNotice(`Moved ${deletingFile.name} to trash`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the file");
    } finally {
      setDeletingFile(null);
    }
  };

  if (isLoadingProject) return <TerminalLoading fullPage />;
  if (!project) {
    return (
      <p className="text-sm text-ink-muted">
        Project not found.
      </p>
    );
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="secret_files"
      featureName="Secret Files"
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <PageHeader
            icon={FileKey}
            title="Secret Files"
            description={
              <>
                Keystores, SSH keys, and certificates for {project.name} —
                encrypted, versioned, and written to their path on pull.
              </>
            }
          />
        </div>

        {notice && (
          <div className="rounded-lg border border-accent-line bg-accent-soft p-4 border-accent-line bg-accent-soft">
            <p className="text-sm text-accent">
              {notice}
            </p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-danger-line bg-danger-soft p-4 border-danger-line bg-danger-soft">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Environment filter */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-ink-muted">
            Environment:
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedEnvironment("all")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedEnvironment === "all"
                  ? "bg-surface text-white bg-surface-raised text-ink-inverse"
                  : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
              }`}
            >
              All
            </button>
            {ENVIRONMENTS.map((env) => (
              <button
                key={env}
                onClick={() => setSelectedEnvironment(env)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  selectedEnvironment === env
                    ? "bg-surface text-white bg-surface-raised text-ink-inverse"
                    : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
                }`}
              >
                {env}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="rounded-xl border border-line bg-white border-line bg-surface">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 border-line">
            <div>
              <h2 className="font-semibold text-ink">
                Files
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {filteredFiles.length} file
                {filteredFiles.length !== 1 ? "s" : ""}
                {selectedEnvironment !== "all" && ` in ${selectedEnvironment}`}
              </p>
            </div>
            {canCreate && (
              <button
                onClick={() => setShowCreateDrawer(true)}
                disabled={!canCreateGate}
                title={
                  !canCreateGate && quota
                    ? `Secret file limit reached (${quota.current}/${quota.limit}) across this organization. Upgrade to add more.`
                    : undefined
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:justify-start bg-surface-raised text-ink-inverse hover:bg-surface-hover"
              >
                <Plus className="h-4 w-4" />
                Add File
              </button>
            )}
          </div>

          <div className="divide-y divide-line">
            {isLoadingFiles ? (
              <TerminalLoading />
            ) : filteredFiles.length === 0 ? (
              <div className="px-4 py-12 text-center sm:px-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
                  <FileKey className="h-6 w-6 text-ink-muted" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-ink">
                  No secret files yet
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {canCreate
                    ? "Upload a keystore or an SSH key and every clone of this project can build without asking anyone for it."
                    : "No secret files available for this environment."}
                </p>
              </div>
            ) : (
              <AnimatedList className="divide-y divide-line">
                {filteredFiles.map((file) => (
                  <FileListItem
                    key={file._id}
                    file={file}
                    onDownload={() => handleDownload(file)}
                    onReplace={() => {
                      setReplaceMode(true);
                      setEditingFile(file);
                    }}
                    onEdit={() => {
                      setReplaceMode(false);
                      setEditingFile(file);
                    }}
                    onDelete={() => setDeletingFile(file)}
                    onManagePermissions={() => setPermissionsFile(file)}
                    isDownloading={downloadingIds.has(file._id)}
                    canEdit={canUpdate || file.access === "write"}
                    canDelete={canDelete}
                    canManagePermissions={canManagePermissions}
                  />
                ))}
              </AnimatedList>
            )}
          </div>
        </div>
      </div>

      <FileFormDrawer
        isOpen={showCreateDrawer || editingFile !== null}
        onClose={closeDrawers}
        onSubmit={handleSubmit}
        file={editingFile}
        replaceMode={replaceMode}
      />

      {permissionsFile && (
        <FilePermissionsDrawer
          isOpen
          onClose={() => setPermissionsFile(null)}
          file={permissionsFile}
          currentUserId={convexUserId as Id<"users"> | undefined}
        />
      )}

      <ConfirmDialog
        isOpen={deletingFile !== null}
        title="Move file to trash"
        message={
          deletingFile
            ? `"${deletingFile.name}" (${deletingFile.path}) will be moved to trash and permanently deleted after the retention window.`
            : ""
        }
        confirmText="Move to trash"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeletingFile(null)}
      />
    </FeatureGate>
  );
}
