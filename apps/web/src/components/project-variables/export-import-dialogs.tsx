"use client";

import type { Id } from "@convex/_generated/dataModel";
import { ExportDialog, ImportDialog } from "@/components/variables";

// The project's .env export and import drawers.
export function ExportImportDialogs({
  projectId,
  projectName,
  organizationId,
  showExport,
  onCloseExport,
  showImport,
  onCloseImport,
}: {
  projectId: Id<"projects"> | undefined;
  projectName: string;
  organizationId: Id<"organizations"> | undefined;
  showExport: boolean;
  onCloseExport: () => void;
  showImport: boolean;
  onCloseImport: () => void;
}) {
  if (!projectId) return null;

  return (
    <>
      <ExportDialog
        isOpen={showExport}
        onClose={onCloseExport}
        projectId={projectId}
        projectName={projectName || "project"}
        organizationId={organizationId}
      />

      <ImportDialog
        isOpen={showImport}
        onClose={onCloseImport}
        projectId={projectId}
        organizationId={organizationId}
      />
    </>
  );
}
