"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { useAssignableProjectMembers } from "@/hooks";
import {
  useSecretFileGrants,
  useGrantSecretFileAccess,
  useRevokeSecretFileAccess,
  type SecretFile,
} from "@/hooks/useSecretFiles";

interface FilePermissionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  file: SecretFile;
  currentUserId: Id<"users"> | undefined;
}

const selectClasses =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

/**
 * Per-file grants — the same viewer-sharing model accounts use.
 *
 * A grant lets someone without blanket write on the project download (or
 * replace) exactly this one file. Every grant and revoke is audited.
 */
export function FilePermissionsDrawer({
  isOpen,
  onClose,
  file,
  currentUserId,
}: FilePermissionsDrawerProps) {
  const grants = useSecretFileGrants(file._id);
  const { members } = useAssignableProjectMembers(
    file.projectId,
    currentUserId
  );
  const grantAccess = useGrantSecretFileAccess();
  const revokeAccess = useRevokeSecretFileAccess();

  const [selectedUser, setSelectedUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grantedUserIds = new Set((grants ?? []).map((g) => g.userId as string));
  const candidates = members.filter(
    (m): m is NonNullable<typeof m> =>
      m !== null && !grantedUserIds.has(m._id as string)
  );

  const handleGrant = async () => {
    if (!selectedUser) return;
    setBusy(true);
    setError(null);
    try {
      await grantAccess({
        fileId: file._id,
        userId: selectedUser as Id<"users">,
        // Always read — see the note below the picker.
        permission: "read",
      });
      setSelectedUser("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (userId: Id<"users">) => {
    setBusy(true);
    setError(null);
    try {
      await revokeAccess({ fileId: file._id, userId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title={`Access — ${file.name}`}
      preventClose={busy}
      width="lg"
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <label
            htmlFor="file-grant-user"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Grant access
          </label>
          <select
            id="file-grant-user"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className={selectClasses}
          >
            <option value="">Select a member…</option>
            {candidates.map((m) => (
              <option key={m._id as string} value={m._id as string}>
                {m.name || m.email}
              </option>
            ))}
          </select>

          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Grants are read-only: the person can download this one file, nothing
            else. Only members assigned to the project can replace a file, so
            offering &ldquo;write&rdquo; here would hand out access the server
            then resolves back down to read.
          </p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleGrant}
              disabled={!selectedUser || busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Grant
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Current grants
          </h3>
          {grants === undefined ? (
            <TerminalLoading />
          ) : grants.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No individual grants. Access follows project roles.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {grants.map((grant) => (
                <div
                  key={grant._id as string}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">
                      {grant.userName || grant.userEmail}
                    </p>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        grant.permission === "write"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}
                    >
                      {grant.permission}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(grant.userId)}
                    disabled={busy}
                    aria-label={`Revoke access for ${grant.userEmail}`}
                    title="Revoke access"
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DrawerPanel>
  );
}
