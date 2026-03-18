import { createFileRoute } from "@tanstack/react-router";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/organizations")({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const organizations = useAdminQuery(api.admin.listOrganizations, {});

  const columns: Column<Record<string, unknown>>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "slug", header: "Slug" },
    {
      key: "tier",
      header: "Tier",
      render: (row) => (
        <Badge variant={row.tier === "pro" ? "purple" : "default"}>
          {(row.tier as string) ?? "free"}
        </Badge>
      ),
    },
    {
      key: "memberCount",
      header: "Members",
      sortable: true,
      render: (row) => <span>{(row.memberCount as number) ?? 0}</span>,
    },
    {
      key: "projectCount",
      header: "Projects",
      sortable: true,
      render: (row) => <span>{(row.projectCount as number) ?? 0}</span>,
    },
    {
      key: "_creationTime",
      header: "Created",
      sortable: true,
      render: (row) => (
        <span className="text-zinc-400">
          {formatDate(row._creationTime as number)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Organizations</h1>
      <DataTable
        columns={columns}
        data={organizations as unknown as Record<string, unknown>[] | undefined}
        isLoading={!organizations}
        rowKey={(row) => row._id as string}
        emptyMessage="No organizations found"
      />
    </div>
  );
}
