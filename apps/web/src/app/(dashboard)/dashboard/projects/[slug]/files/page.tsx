"use client";

import { useState, use } from "react";
import { FileKey, Plus } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { ConfirmDialog } from "@/components/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { useProjectBySlug, useConvexUser } from "@/hooks";
import {
  useSecretFiles,
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
 * can put it exactly where the build expects without anyone remembering.
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
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState("all");
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingFile, setEditingFile] = useState<SecretFile | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [deletingFile, setDeletingFile] = useState<SecretFile | null>(null);
  const [permissionsFile, setPermissionsFile] = useState<SecretFile | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

  const fileList = files ?? [];
  const { allowed: withinLimit } = useFeatureGate(orgId, "secret_files_limit", {
    currentCount: fileList.length,
  });

  const filtered = fileList.filter(
    (f) =>
      selectedEnvironment === "all" ||
      f.environments.includes(selectedEnvironment)
  );

  const openCreate = () => {
    setEditingFile(null);
    setReplaceMode(false);
    setFormError(null);
    setShowDrawer(true);
  };

  const openEdit = (file: SecretFile) => {
    setEditingFile(file);
    setReplaceMode(false);
    setFormError(null);
    setShowDrawer(true);
  };

  const openReplace = (file: SecretFile) => {
    setEditingFile(file);
    setReplaceMode(true);
    setFormError(null);
    setShowDrawer(true);
  };

  const handleSubmit = async (data: FileFormData) => {
    if (!projectId) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
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
        if (!data.file) {
          setFormError("Choose a file to upload");
          return;
        }
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
      setShowDrawer(false);
      setEditingFile(null);
      setReplaceMode(false);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save the file";
      log.error("secret file save failed", { message });
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (file: SecretFile) => {
    setDownloadingIds((prev) => new Set(prev).add(file._id));
    setError(null);
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
    try {
      await deleteFile({ fileId: deletingFile._id });
      setNotice(`Moved ${deletingFile.name} to trash`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the file");
    } finally {
      setDeletingFile(null);
    }
  };

  if (isLoadingProject) return <TerminalLoading />;
  if (project === null) {
    return <p className="p-6 text-sm text-zinc-500">Project not found.</p>;
  }

  return (
    <FeatureGate
      organizationId={orgId}
      featureKey="secret_files"
      featureName="Secret Files"
    >
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              <FileKey className="h-5 w-5 text-green-600 dark:text-green-500" />
              Secret Files
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Keystores, SSH keys, and certificates — encrypted, versioned, and
              written to their path by the CLI, the extension, and CI.
            </p>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              disabled={!withinLimit}
              title={
                withinLimit
                  ? "Upload a secret file"
                  : "Secret file limit reached for your plan"
              }
              className="inline-flex items-center gap-2 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Upload file
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="file-env-filter" className="sr-only">
            Filter by environment
          </label>
          <select
            id="file-env-filter"
            value={selectedEnvironment}
            onChange={(e) => setSelectedEnvironment(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All environments</option>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">
            {filtered.length} file{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {notice && (
          <p className="rounded border border-green-200 bg-green-50 p-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}

        {isLoadingFiles ? (
          <TerminalLoading />
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
            <FileKey className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No secret files yet.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Upload a keystore or an SSH key and every clone of this project
              can build without asking anyone for it.
            </p>
          </div>
        ) : (
          <AnimatedList className="space-y-2">
            {filtered.map((file) => (
              <FileListItem
                key={file._id}
                file={file}
                onDownload={() => handleDownload(file)}
                onReplace={() => openReplace(file)}
                onEdit={() => openEdit(file)}
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

      <FileFormDrawer
        open={showDrawer}
        editing={editingFile}
        replaceMode={replaceMode}
        isSubmitting={isSubmitting}
        error={formError}
        onClose={() => {
          setShowDrawer(false);
          setEditingFile(null);
          setReplaceMode(false);
        }}
        onSubmit={handleSubmit}
      />

      {permissionsFile && (
        <FilePermissionsDrawer
          file={permissionsFile}
          currentUserId={convexUserId as Id<"users"> | undefined}
          onClose={() => setPermissionsFile(null)}
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
