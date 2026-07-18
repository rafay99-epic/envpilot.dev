import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { QueryState } from "@/components/ui/QueryState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/Toast";

interface UserTierRow extends Record<string, unknown> {
  _id: string;
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  tier: string;
  ownedOrgCount: number;
  graceActive: boolean;
  gracePeriodEnd?: number;
}

export function UserTierAssignmentsTab() {
  const tierDefs = useAdminQuery(
    api.features.admin.tiers.listTierDefinitions,
    {}
  );
  const userTiers = useAdminQuery(api.features.admin.users.listUserTiers, {});
  const updateUserTier = useAdminMutation(
    api.features.admin.users.updateUserTier
  );

  const tierOptions = (tierDefs ?? []).map((td) => ({
    value: td.name,
    label: td.displayName,
  }));

  const columns: Column<UserTierRow>[] = [
    { key: "userName", header: "User", sortable: true },
    { key: "userEmail", header: "Email", sortable: true },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <Select
          options={tierOptions}
          value={row.tier}
          aria-label={`Tier for ${row.userName}`}
          onChange={async (e) => {
            try {
              await updateUserTier({
                userId: row.userId,
                tier: e.target.value,
                reason: "admin.manual_reassignment",
              });
              toast("success", `Tier updated for ${row.userName}`);
            } catch (err) {
              toast(
                "error",
                err instanceof Error ? err.message : "Failed to update tier"
              );
            }
          }}
        />
      ),
    },
    { key: "ownedOrgCount", header: "Owned Orgs", sortable: true },
    {
      key: "graceActive",
      header: "Grace Period",
      render: (row) =>
        row.graceActive ? (
          <Badge variant="default">
            {Math.ceil(
              ((row.gracePeriodEnd ?? 0) - Date.now()) / (1000 * 60 * 60 * 24)
            )}
            d left
          </Badge>
        ) : (
          <span className="text-zinc-500">—</span>
        ),
    },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">
        User Tier Assignments
      </h2>
      <QueryState
        data={userTiers as unknown as UserTierRow[] | undefined}
        empty={{
          message:
            "No user tier assignments yet. Users are assigned tiers when they subscribe or are manually assigned.",
        }}
      >
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(row) => row._id}
            emptyMessage="No user tiers found"
          />
        )}
      </QueryState>
    </section>
  );
}
