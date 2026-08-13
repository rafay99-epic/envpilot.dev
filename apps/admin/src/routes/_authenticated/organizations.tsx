import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { QueryState } from "@/components/ui/QueryState";
import { useFilteredList } from "@/hooks/useFilteredList";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/organizations")({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const organizations = useAdminQuery(
    api.features.admin.organizations.listOrganizations,
    {}
  );
  const [search, setSearch] = useState("");

  const filteredOrgs = useFilteredList(
    organizations as Record<string, unknown>[] | undefined,
    search,
    (org) => [org.name as string, org.slug as string]
  );

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
        <span className="text-ink-muted">
          {formatDate(row._creationTime as number)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">
        Organizations
      </h1>
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or slug..."
          className="w-72"
        />
      </div>
      {organizations && (
        <p className="mb-3 text-xs text-ink-subtle">
          {search.trim()
            ? `${filteredOrgs?.length ?? 0} of ${(organizations as Record<string, unknown>[]).length} organizations match`
            : `${(organizations as Record<string, unknown>[]).length} organizations`}
        </p>
      )}
      <QueryState
        data={filteredOrgs}
        empty={{ message: "No organizations found" }}
      >
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(row) => row._id as string}
          />
        )}
      </QueryState>
    </div>
  );
}
