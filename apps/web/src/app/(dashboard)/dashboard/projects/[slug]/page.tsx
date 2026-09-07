"use client";

import { useState, use } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import {
  useProjectBySlug,
  useConvexUser,
  useOrganizationTags,
  useSharingStatus,
  type SharedRow,
} from "@/hooks";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import {
  ExportImportDialogs,
  ProjectDetailHeader,
  ProjectNotFound,
  ShareDialogs,
  VariableCreateDialog,
  VariableDeleteDialog,
  VariableEditDialog,
  VariableHistoryDialog,
  VariablesFilterBar,
  VariablesPanel,
  type Variable,
} from "@/components/project-variables";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = use(params);
  const { canDo, organization, user, capabilities } = useAuthContext();
  // Project actions follow the caller's resolved registry profile so custom
  // roles receive the same gates the Convex authorization layer enforces.
  const canCreateVariable = capabilities["project.variables.create"] === true;
  const canUpdateVariable = capabilities["project.variables.update"] === true;
  const canDeleteVariable = capabilities["project.variables.delete"] === true;
  const canSeeTrash =
    canDeleteVariable || capabilities["project.read"] === true;
  // Read access keeps the trash recovery route available to members who may
  // need to restore content they previously deleted.
  const canRequestVariable = capabilities["project.requests.submit"] === true;
  const canAddVariable = canCreateVariable || canRequestVariable;

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { enabled: sharingEnabled } = useSharingStatus(orgId);
  const canManageShares =
    sharingEnabled && capabilities["project.workspaces.manage"] === true;

  const { allowed: showRotation } = useFeatureGate(orgId, "secret_rotation");
  const { allowed: canShare } = useFeatureGate(orgId, "secret_sharing");
  const { allowed: showTags } = useFeatureGate(orgId, "variable_tags");
  const { tags: tagsData } = useOrganizationTags(showTags ? orgId : undefined);
  const orgTags = showTags ? tagsData : [];

  // --- Convex: real-time data fetching (direct WebSocket, no API proxy) ---
  const { convexUserId } = useConvexUser(user?.id);

  const project = useProjectBySlug(orgId, slug);
  const isLoading = project === undefined && !!slug;
  const projectError = project === null ? new Error("Project not found") : null;

  const projectId = project?._id as Id<"projects"> | undefined;

  // --- Local UI state ---
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExportDrawer, setShowExportDrawer] = useState(false);
  const [showImportDrawer, setShowImportDrawer] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [deletingVariable, setDeletingVariable] = useState<Variable | null>(
    null
  );
  // Share drawer state
  const [sharingVariable, setSharingVariable] = useState<Variable | null>(null);
  // Cross-project sharing: the sheet, plus the shared row being edited or
  // deleted. Shared rows are written through their group, not this project.
  const [sharingAcross, setSharingAcross] = useState<Variable | null>(null);
  const [editingShared, setEditingShared] = useState<SharedRow | null>(null);
  const [deletingShared, setDeletingShared] = useState<SharedRow | null>(null);

  // History modal state
  const [historyVariableId, setHistoryVariableId] = useState<string | null>(
    null
  );
  const [historyVariableKey, setHistoryVariableKey] = useState<string>("");
  const [historyVariableVersion, setHistoryVariableVersion] =
    useState<number>(0);

  const handleViewHistory = (variable: Variable) => {
    setHistoryVariableId(variable._id);
    setHistoryVariableKey(variable.key);
    setHistoryVariableVersion(variable.version);
  };

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return <ProjectNotFound error={projectError} />;
  }

  return (
    <div className="space-y-8">
      <ProjectDetailHeader project={project} canSeeTrash={canSeeTrash} />

      <VariablesFilterBar
        selectedEnvironment={selectedEnvironment}
        onSelectEnvironment={setSelectedEnvironment}
        showTags={showTags}
        tags={orgTags}
        selectedTags={selectedTags}
        setSelectedTags={setSelectedTags}
      />

      <VariablesPanel
        projectId={projectId}
        projectName={project.name}
        organizationId={orgId}
        convexUserId={convexUserId}
        tags={orgTags}
        selectedEnvironment={selectedEnvironment}
        selectedTags={selectedTags}
        capabilities={{
          canCreateVariable,
          canAddVariable,
          canUpdateVariable,
          canDeleteVariable,
          canShare,
          canManageShares,
        }}
        onCreate={() => setShowCreateModal(true)}
        onExport={() => setShowExportDrawer(true)}
        onImport={() => setShowImportDrawer(true)}
        onEditVariable={setEditingVariable}
        onDeleteVariable={setDeletingVariable}
        onViewHistory={handleViewHistory}
        onShareVariable={setSharingVariable}
        onShareAcross={setSharingAcross}
        onEditShared={setEditingShared}
        onDeleteShared={setDeletingShared}
      />

      <VariableCreateDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectId={projectId}
        organizationId={orgId}
        canCreateVariable={canCreateVariable}
      />

      <VariableEditDialog
        variable={editingVariable}
        onClose={() => setEditingVariable(null)}
        projectId={projectId}
        organizationId={orgId}
        convexUserId={convexUserId}
        showRotation={showRotation}
        showTags={showTags}
        tags={orgTags}
      />

      <VariableDeleteDialog
        variable={deletingVariable}
        onClose={() => setDeletingVariable(null)}
        projectId={projectId}
        organizationId={orgId}
      />

      <ExportImportDialogs
        projectId={projectId}
        projectName={project.name}
        organizationId={orgId}
        showExport={showExportDrawer}
        onCloseExport={() => setShowExportDrawer(false)}
        showImport={showImportDrawer}
        onCloseImport={() => setShowImportDrawer(false)}
      />

      <VariableHistoryDialog
        variableId={historyVariableId}
        variableKey={historyVariableKey}
        currentVersion={historyVariableVersion}
        onClose={() => {
          setHistoryVariableId(null);
          setHistoryVariableKey("");
          setHistoryVariableVersion(0);
        }}
        projectId={projectId}
        organizationId={orgId}
        convexUserId={convexUserId}
        canRollback={canDo("org:rollback_variable")}
      />

      <ShareDialogs
        editingShared={editingShared}
        deletingShared={deletingShared}
        onCloseShared={() => {
          setEditingShared(null);
          setDeletingShared(null);
        }}
        sharingAcross={sharingAcross}
        onCloseSharingAcross={() => setSharingAcross(null)}
        sharingVariable={sharingVariable}
        onCloseSharingVariable={() => setSharingVariable(null)}
        projectId={projectId}
        organizationId={orgId}
        showRotation={showRotation}
      />
    </div>
  );
}
