import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConvexError } from "convex/values";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { QueryState } from "@/components/ui/QueryState";
import { toast } from "@/components/ui/Toast";
import { useFilteredList } from "@/hooks/useFilteredList";
import { timeAgo } from "@/lib/utils";
import { ShieldBan, ShieldCheck } from "lucide-react";
import { useConfirmStore } from "@/stores/confirm-store";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

/** ConvexError payloads survive prod redaction; plain Error.message does not */
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) return String(err.data);
  return err instanceof Error ? err.message : fallback;
}

interface UserRow extends Record<string, unknown> {
  _id: Id<"users">;
  name: string | null;
  email: string;
  organizationCount: number;
  lastActiveAt: number | null;
  isBanned: boolean;
  banReason?: string;
}

function UsersPage() {
  const users = useAdminQuery(api.features.admin.users.listUsers, {});
  const banUser = useAdminMutation(api.features.admin.users.banUser);
  const unbanUser = useAdminMutation(api.features.admin.users.unbanUser);
  const { confirm } = useConfirmStore();

  const [search, setSearch] = useState("");

  const filteredUsers = useFilteredList(
    users as UserRow[] | undefined,
    search,
    (u) => [u.name, u.email]
  );

  const [banModal, setBanModal] = useState<{
    userId: Id<"users">;
    name: string;
  } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [isBanning, setIsBanning] = useState(false);

  const handleBan = async () => {
    if (!banModal) return;
    setIsBanning(true);
    try {
      await banUser({ userId: banModal.userId, banReason });
      setBanModal(null);
      setBanReason("");
    } catch (err) {
      toast("error", errMsg(err, "Failed to ban user"));
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnban = async (userId: Id<"users">) => {
    const ok = await confirm({
      title: "Unban User",
      message:
        "This user will regain full access to the platform. Are you sure?",
      confirmLabel: "Unban",
      variant: "default",
    });
    if (!ok) return;
    try {
      await unbanUser({ userId });
    } catch (err) {
      toast("error", errMsg(err, "Failed to unban user"));
    }
  };

  const columns: Column<UserRow>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "email", header: "Email", sortable: true },
    {
      key: "organizationCount",
      header: "Orgs",
      sortable: true,
      render: (row) => <span>{row.organizationCount ?? 0}</span>,
    },
    {
      key: "lastActiveAt",
      header: "Last Active",
      sortable: true,
      render: (row) =>
        row.lastActiveAt ? (
          <span className="text-ink-muted">{timeAgo(row.lastActiveAt)}</span>
        ) : (
          <span className="text-ink-faint">Never</span>
        ),
    },
    {
      key: "isBanned",
      header: "Status",
      render: (row) =>
        row.isBanned ? (
          <Badge variant="danger">Banned</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.isBanned ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleUnban(row._id);
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs">Unban</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setBanModal({
                userId: row._id,
                name: row.name ?? "User",
              });
            }}
          >
            <ShieldBan className="h-3.5 w-3.5 text-danger" />
            <span className="text-xs">Ban</span>
          </Button>
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Users</h1>

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or email..."
          className="w-72"
        />
      </div>

      {users && (
        <p className="mb-3 text-xs text-ink-subtle">
          {search.trim()
            ? `${filteredUsers?.length ?? 0} of ${users.length} users match`
            : `${users.length} users`}
        </p>
      )}

      <QueryState data={filteredUsers} empty={{ message: "No users found" }}>
        {(rows) => (
          <DataTable columns={columns} data={rows} rowKey={(row) => row._id} />
        )}
      </QueryState>

      <Modal
        isOpen={!!banModal}
        onClose={() => {
          setBanModal(null);
          setBanReason("");
        }}
        title={`Ban ${banModal?.name ?? "User"}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            This will prevent the user from accessing the platform. Provide a
            reason for the ban.
          </p>
          <Textarea
            label="Reason"
            id="ban-reason"
            placeholder="Enter ban reason..."
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBanModal(null);
                setBanReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBan}
              disabled={isBanning || !banReason.trim()}
            >
              {isBanning ? "Banning..." : "Ban User"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
