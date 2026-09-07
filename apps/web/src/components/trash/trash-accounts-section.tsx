"use client";

import { useMutation } from "convex/react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { fileProposal } from "@/components/changes";
import { getProtectedEnvironmentError } from "@/lib/error-messages";
import { DeletedTiming } from "./deleted-timing";
import { RestoreButton } from "./restore-button";
import { TrashSection } from "./trash-section";
import type { DeletedAccount, TrashSectionProps } from "./trash-items";

export function TrashAccountsSection({
  accounts,
  projectId,
  convexUserId,
  now,
  restoringId,
  onRestoringChange,
  emptying,
}: TrashSectionProps & {
  accounts: DeletedAccount[] | undefined;
  convexUserId: string | undefined;
}) {
  const restoreAccount = useMutation(api.features.accounts.mutations.restore);
  const createChangeRequest = useMutation(
    api.features.changeRequests.mutations.create
  );

  async function handleRestoreAccount(account: {
    _id: Id<"projectAccounts">;
    name: string;
    environments: string[];
  }) {
    if (!convexUserId) return;
    onRestoringChange(account._id);
    try {
      await restoreAccount({
        accountId: account._id,
        restoredBy: convexUserId as Id<"users">,
      });
      toast.success(`Restored ${account.name}`);
    } catch (err) {
      const blocked = getProtectedEnvironmentError(err);
      if (blocked && projectId) {
        toast.error(blocked.message, {
          action: {
            label: "Propose restore",
            onClick: () => {
              void fileProposal(createChangeRequest, {
                projectId,
                resourceType: "account",
                kind: "restore",
                targetId: account._id,
                environments: account.environments,
                payload: "{}",
                label: account.name,
                source: "web",
              });
            },
          },
        });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to restore account"
        );
      }
    }
    onRestoringChange(null);
  }

  if (!accounts || accounts.length === 0) return null;

  return (
    <TrashSection
      icon={UserRound}
      title="Shared accounts"
      count={accounts.length}
    >
      {accounts.map((account) => (
        <div
          key={account._id}
          className="flex items-center justify-between gap-4 px-6 py-3"
        >
          <div className="min-w-0 flex-1 opacity-60">
            <span className="text-sm font-semibold line-through text-ink-muted">
              {account.name}
            </span>
            <DeletedTiming deletedAt={account.deletedAt} now={now} />
          </div>
          <RestoreButton
            restoring={restoringId === account._id}
            emptying={emptying}
            onClick={() => handleRestoreAccount(account)}
          />
        </div>
      ))}
    </TrashSection>
  );
}
