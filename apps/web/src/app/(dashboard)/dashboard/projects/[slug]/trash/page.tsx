"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useProjectBySlug, useConvexUser, useNow } from "@/hooks";
import { useAuthContext } from "@/components/auth";
import {
  EmptyTrashAction,
  TrashBody,
  trashIsLoading,
  trashItemCount,
  RETENTION_DAYS,
} from "@/components/trash";

interface TrashPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Project trash — soft-deleted variables and shared accounts inside their
 * 7-day restore window. Items render disabled (they ARE disabled — nothing
 * serves them) with a restore action each, plus a permanent "Empty trash"
 * for owners / assigned managers that destroys Vault objects and rows now,
 * skipping the remaining retention days.
 */
export default function TrashPage({ params }: TrashPageProps) {
  const { slug } = use(params);
  const now = useNow(60_000);
  const { organization, user, capabilities } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  // Direct by-slug lookup — no dependency on the full project list (and on
  // convexUserId resolving first) just to find one project.
  const project = useProjectBySlug(orgId, slug);
  const projectId = project?._id as Id<"projects"> | undefined;

  const projectArgs: { projectId: Id<"projects"> } | "skip" =
    projectId && convexUserId ? { projectId } : "skip";

  const deletedVariables = useQuery(
    api.features.variables.queries.getDeleted,
    projectArgs
  );
  const deletedAccounts = useQuery(
    api.features.accounts.queries.getDeleted,
    projectId && convexUserId
      ? { projectId, userId: convexUserId as Id<"users"> }
      : "skip"
  );

  const deletedFiles = useQuery(
    api.features.files.queries.getDeleted,
    projectArgs
  );

  // Trashed docs are listed by the docs feature itself: unlike variables and
  // accounts they carry no vault object, so they are not part of the vault
  // sweep and have their own purge cron.
  const deletedDocs = useQuery(
    api.features.docs.queries.listTrashed,
    projectArgs
  );

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);

  // Empty-trash mirrors the variable-deletion capability from the caller's
  // resolved registry profile. The server re-checks; this only hides the
  // button.
  const canEmpty = capabilities["project.variables.delete"] === true;

  const lists = {
    variables: deletedVariables,
    accounts: deletedAccounts,
    files: deletedFiles,
    docs: deletedDocs,
  };
  const loading = project === undefined || trashIsLoading(lists);
  const totalCount = trashItemCount(lists);

  if (project === null) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-ink-subtle">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/projects/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {project?.name ?? "project"}
        </Link>
        <div className="mt-4">
          <PageHeader
            icon={Trash2}
            title="Trash"
            description={`Deleted items stay restorable for ${RETENTION_DAYS} days, then they are destroyed permanently.`}
            actions={
              canEmpty && totalCount > 0 ? (
                <EmptyTrashAction
                  projectId={projectId}
                  totalCount={totalCount}
                  emptying={emptying}
                  onEmptyingChange={setEmptying}
                />
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Body */}
      <TrashBody
        lists={lists}
        loading={loading}
        totalCount={totalCount}
        projectId={projectId}
        convexUserId={convexUserId}
        now={now}
        restoringId={restoringId}
        onRestoringChange={setRestoringId}
        emptying={emptying}
      />
    </div>
  );
}
