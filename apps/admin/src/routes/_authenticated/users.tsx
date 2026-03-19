import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { timeAgo } from "@/lib/utils";
import { ShieldBan, ShieldCheck } from "lucide-react";
import { useConfirmStore } from "@/stores/confirm-store";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

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
  const users = useAdminQuery(api.admin.listUsers, {});
  const banUser = useAdminMutation(api.admin.banUser);
  const unbanUser = useAdminMutation(api.admin.unbanUser);
  const { confirm } = useConfirmStore();

  const [search, setSearch] = useState("");

  const filteredUsers = useMemo(() => {
    if (!users) return undefined;
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return (users as UserRow[]).filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term))
    );
  }, [users, search]);

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
      alert(err instanceof Error ? err.message : "Failed to unban user");
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
          <span className="text-zinc-400">{timeAgo(row.lastActiveAt)}</span>
        ) : (
          <span className="text-zinc-600">Never</span>
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
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
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
            <ShieldBan className="h-3.5 w-3.5 text-red-400" />
            <span className="text-xs">Ban</span>
          </Button>
        ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Users</h1>

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or email..."
          className="w-72"
        />
      </div>

      {users && (
        <p className="mb-3 text-xs text-zinc-500">
          {search.trim()
            ? `${filteredUsers?.length ?? 0} of ${users.length} users match`
            : `${users.length} users`}
        </p>
      )}

      <DataTable
        columns={columns}
        data={filteredUsers as unknown as UserRow[] | undefined}
        isLoading={!users}
        rowKey={(row) => row._id}
        emptyMessage="No users found"
      />

      <Modal
        isOpen={!!banModal}
        onClose={() => {
          setBanModal(null);
          setBanReason("");
        }}
        title={`Ban ${banModal?.name ?? "User"}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
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
