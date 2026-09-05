"use client";

import { use, useState } from "react";
import { toast } from "sonner";
import { Boxes, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import {
  useWorkspaceBySlug,
  useWorkspaceActions,
  useOrganizationProjects,
} from "@/hooks";
import {
  useCreateVariable,
  useDeleteVariable,
  useUpdateVariable,
} from "@/hooks/queries/useVariablesQuery";
import { useAuthContext } from "@/components/auth";
import { ConfirmDialog } from "@/components/ui";
import {
  AdoptDuplicates,
  LinkedProjects,
  ScopeDialog,
  SharedVariables,
  type ScopeTarget,
} from "@/components/workspaces";
import {
  VariableCreateDrawer,
  VariableEditModal,
  type VariableFormData,
} from "@/components/variables";
import { sanitizeConvexError } from "@/lib/error-messages";

interface WorkspacePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * The one route workspaces add.
 *
 * Two lists on a single page: the shared variables, and the projects that
 * read them. No members page (access comes from project membership), no
 * settings page, no trash page — a deleted shared variable lands in the
 * trash of the projects that used it.
 *
 * The page states the model rather than assuming it is obvious: one row is
 * read by every linked project, so an edit here lands everywhere at once and
 * the delete confirmation says how many projects lose the key.
 */
export default function WorkspacePage({ params }: WorkspacePageProps) {
  const { slug } = use(params);
  const { organization, capabilities } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  // Workspace rows are ordinary variables, so the same registry gate applies.
  const canCreateVariable = capabilities["project.variables.create"] === true;

  const data = useWorkspaceBySlug(orgId, slug);
  const allProjects = useOrganizationProjects(orgId);
  const { addProject, removeProject } = useWorkspaceActions();
  const createVariable = useCreateVariable(canCreateVariable);
  const deleteVariable = useDeleteVariable();
  const updateVariable = useUpdateVariable();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removing, setRemoving] = useState<{
    projectId: Id<"projects">;
    name: string;
    inheritedCount: number;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    variableId: Id<"environmentVariables">;
    key: string;
  } | null>(null);
  const [scoping, setScoping] = useState<ScopeTarget | null>(null);
  const [editing, setEditing] = useState<{
    _id: Id<"environmentVariables">;
    key: string;
    environments: string[];
    isSensitive: boolean;
  } | null>(null);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (data === null) {
    return <p className="text-sm text-ink-muted">Workspace not found.</p>;
  }

  const { workspace, variables, projects: members } = data;
  const memberIds = new Set(members.map((member) => member.projectId));
  const candidates = (allProjects ?? []).filter(
    (project) => !memberIds.has(project._id)
  );

  async function handleCreateVariable(
    formData: VariableFormData,
    options?: { silent?: boolean }
  ) {
    try {
      await createVariable.mutateAsync({
        key: formData.key,
        value: formData.value,
        description: formData.description || undefined,
        environments: formData.environments,
        projectId: workspace._id,
        isSensitive: formData.isSensitive,
        rotationFrequencyDays: formData.rotationFrequencyDays,
        tagIds: formData.tagIds,
      });
      if (!options?.silent) {
        toast.success(
          members.length > 0
            ? `Shared with ${members.length} ${members.length === 1 ? "project" : "projects"}.`
            : "Added. Link a project below to start sharing it."
        );
      }
    } catch (error) {
      const message = sanitizeConvexError(error);
      if (!options?.silent) toast.error(message);
      throw new Error(message);
    }
  }

  async function handleUpdateVariable(
    variableId: Id<"environmentVariables">,
    formData: VariableFormData
  ) {
    try {
      await updateVariable.mutateAsync({
        variableId,
        projectId: workspace._id,
        value: formData.value || undefined,
        description: formData.description || undefined,
        environments: formData.environments,
        isSensitive: formData.isSensitive,
        rotationFrequencyDays: formData.rotationFrequencyDays,
        tagIds: formData.tagIds,
      });
      toast.success(
        members.length > 0
          ? `Updated. ${members.length} ${members.length === 1 ? "project reads" : "projects read"} the new value on their next pull.`
          : "Updated."
      );
      setEditing(null);
    } catch (error) {
      const message = sanitizeConvexError(error);
      toast.error(message);
      throw new Error(message);
    }
  }

  async function handleDeleteVariable() {
    if (!deleting) return;
    try {
      await deleteVariable.mutateAsync({
        variableId: deleting.variableId,
        projectId: workspace._id,
      });
      toast.success(`${deleting.key} removed from ${workspace.name}`);
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setDeleting(null);
  }

  async function handleAddProject() {
    if (!pendingProjectId) return;
    setIsAdding(true);
    try {
      await addProject({
        workspaceId: workspace._id,
        projectId: pendingProjectId as Id<"projects">,
      });
      toast.success("Project linked. It now reads these variables.");
      setPendingProjectId("");
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setIsAdding(false);
  }

  async function handleRemoveProject() {
    if (!removing) return;
    try {
      await removeProject({
        workspaceId: workspace._id,
        projectId: removing.projectId,
      });
      toast.success(`${removing.name} unlinked`);
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    }
    setRemoving(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Boxes}
        title={workspace.name}
        description="One copy of each variable, read by every linked project. Edit it here and every project below gets the new value on its next pull."
        actions={
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-subtle transition-colors hover:border-line-strong hover:text-ink-muted"
          >
            <Plus className="h-4 w-4" />
            Add Variable
          </button>
        }
      />

      <SharedVariables
        variables={variables}
        memberCount={members.length}
        onAdd={() => setIsDrawerOpen(true)}
        onEdit={(variable) =>
          setEditing({
            _id: variable._id,
            key: variable.key,
            environments: variable.environments,
            isSensitive: variable.isSensitive,
          })
        }
        onScope={setScoping}
        onDelete={setDeleting}
      />

      <LinkedProjects
        members={members}
        candidates={candidates}
        pendingProjectId={pendingProjectId}
        isAdding={isAdding}
        onPendingChange={setPendingProjectId}
        onAdd={handleAddProject}
        onRemove={(member) =>
          setRemoving({
            projectId: member.projectId,
            name: member.name,
            inheritedCount: member.inheritedCount,
          })
        }
      />

      <ScopeDialog
        workspaceId={workspace._id}
        target={scoping}
        members={members.map((member) => ({
          projectId: member.projectId,
          name: member.name,
        }))}
        onClose={() => setScoping(null)}
      />

      <AdoptDuplicates
        workspaceId={workspace._id}
        memberCount={members.length}
      />

      <VariableCreateDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onCreate={handleCreateVariable}
        organizationId={orgId}
        projectId={workspace._id}
        title="Add shared variable"
        submitLabel="Share Variable"
      />

      <VariableEditModal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        variable={editing}
        onSave={handleUpdateVariable}
      />

      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Unlink ${removing?.name ?? ""}?`}
        message={`It loses ${removing?.inheritedCount ?? 0} inherited ${
          removing?.inheritedCount === 1 ? "variable" : "variables"
        } on its next pull. Its own variables are untouched, and the workspace keeps the values.`}
        confirmText="Unlink"
        onConfirm={handleRemoveProject}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.key ?? ""}?`}
        message={
          members.length > 0
            ? `${members.length} ${members.length === 1 ? "project" : "projects"} read this value and will lose the key on their next pull, sync or workflow run.`
            : "No project reads this value yet."
        }
        confirmText="Delete"
        confirmPhrase={members.length > 1 ? deleting?.key : undefined}
        onConfirm={handleDeleteVariable}
        variant="danger"
      />
    </div>
  );
}
