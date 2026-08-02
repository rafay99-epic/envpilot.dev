"use client";

import { useState } from "react";
import { Loader2, Trash2, Users, X } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAssignableProjectMembers } from "@/hooks";
import {
  useSecretFileGrants,
  useGrantSecretFileAccess,
  useRevokeSecretFileAccess,
  type SecretFile,
} from "@/hooks/useSecretFiles";

interface FilePermissionsDrawerProps {
  file: SecretFile;
  currentUserId: Id<"users"> | undefined;
  onClose: () => void;
}

/**
 * Per-file grants — the same "viewer sharing" model accounts use.
 *
 * A grant lets someone who has no blanket write on the project download (or
 * replace) exactly this one file. Every grant and revoke is audited.
 */
export function FilePermissionsDrawer({
  file,
  currentUserId,
  onClose,
}: FilePermissionsDrawerProps) {
  const grants = useSecretFileGrants(file._id);
  const { members } = useAssignableProjectMembers(
    file.projectId,
    currentUserId
  );
  const grantAccess = useGrantSecretFileAccess();
  const revokeAccess = useRevokeSecretFileAccess();

  const [selectedUser, setSelectedUser] = useState<string>("");
  const [permission, setPermission] = useState<"read" | "write">("read");
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
        permission,
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <Users className="h-4 w-4 text-green-600 dark:text-green-500" />
            Access to {file.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-2 rounded border border-zinc-200 p-3 dark:border-zinc-800">
            <label
              htmlFor="file-grant-user"
              className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
            >
              Grant access
            </label>
            <select
              id="file-grant-user"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Select a member…</option>
              {candidates.map((m) => (
                <option key={m._id as string} value={m._id as string}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                aria-label="Permission level"
                value={permission}
                onChange={(e) =>
                  setPermission(e.target.value as "read" | "write")
                }
                className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="read">Read (download)</option>
                <option value="write">Write (replace)</option>
              </select>
              <button
                type="button"
                onClick={handleGrant}
                disabled={!selectedUser || busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Grant
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Current grants
            </h3>
            {grants === undefined ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            ) : grants.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No individual grants. Access follows project roles.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {grants.map((grant) => (
                  <li
                    key={grant._id as string}
                    className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
                  >
                    <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
                      {grant.userName || grant.userEmail}
                      <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {grant.permission}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(grant.userId)}
                      disabled={busy}
                      aria-label={`Revoke access for ${grant.userEmail}`}
                      className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
