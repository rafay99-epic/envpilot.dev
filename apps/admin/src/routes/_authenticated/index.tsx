import { createFileRoute } from "@tanstack/react-router";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Card, StatCard } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { BarChart, DonutChart, AreaChart } from "@/components/ui/charts";
import {
  Users,
  Building2,
  FolderOpen,
  Mail,
  Ticket,
  Lightbulb,
  Crown,
  Shield,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

function DashboardPage() {
  const stats = useAdminQuery(api.admin.getStats, {});
  const analytics = useAdminQuery(api.admin.getAnalytics, {});
  const settings = useAdminQuery(api.admin.getAdminSettings, {});
  const updateSetting = useAdminMutation(api.admin.updateAdminSetting);

  if (!stats) return <Spinner />;

  const tierEnforcement = settings?.tierEnforcement === "true";

  const handleToggleEnforcement = async () => {
    await updateSetting({
      key: "tierEnforcement",
      value: tierEnforcement ? "false" : "true",
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>

        {/* Tier Enforcement Toggle */}
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
          <Shield className="h-4 w-4 text-zinc-400" />
          <span className="text-sm text-zinc-300">Tier Enforcement</span>
          <button
            onClick={handleToggleEnforcement}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              tierEnforcement ? "bg-emerald-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                tierEnforcement ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-xs font-medium ${tierEnforcement ? "text-emerald-400" : "text-zinc-500"}`}
          >
            {tierEnforcement ? "Active" : "Disabled"}
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={<Users className="h-5 w-5" />}
          trend={
            analytics
              ? `+${analytics.recent30d.users} this month`
              : undefined
          }
        />
        <StatCard
          title="Organizations"
          value={stats.totalOrganizations}
          icon={<Building2 className="h-5 w-5" />}
          trend={
            analytics
              ? `+${analytics.recent30d.organizations} this month`
              : undefined
          }
        />
        <StatCard
          title="Projects"
          value={stats.totalProjects}
          icon={<FolderOpen className="h-5 w-5" />}
          trend={
            analytics
              ? `+${analytics.recent30d.projects} this month`
              : undefined
          }
        />
        <StatCard
          title="Unread Messages"
          value={stats.unreadMessages}
          icon={<Mail className="h-5 w-5" />}
        />
        <StatCard
          title="Open Tickets"
          value={stats.openTickets}
          icon={<Ticket className="h-5 w-5" />}
          trend={
            analytics
              ? `+${analytics.recent30d.tickets} this month`
              : undefined
          }
        />
        <StatCard
          title="Feature Requests"
          value={stats.totalFeatureRequests}
          icon={<Lightbulb className="h-5 w-5" />}
        />
        {Object.entries(stats.tierDistribution).map(([tierName, count]) => (
          <StatCard
            key={tierName}
            title={`${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Tier`}
            value={count}
            icon={<Crown className="h-5 w-5" />}
            trend="organizations"
          />
        ))}
      </div>

      {/* Charts section */}
      {analytics && (
        <>
          {/* Growth Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  Platform Growth
                </h2>
              </div>
              <AreaChart
                series={[
                  {
                    data: analytics.monthLabels.map((label, i) => ({
                      label,
                      value: analytics.userGrowth[i],
                    })),
                    color: "#10b981",
                    label: "Users",
                  },
                  {
                    data: analytics.monthLabels.map((label, i) => ({
                      label,
                      value: analytics.orgGrowth[i],
                    })),
                    color: "#3b82f6",
                    label: "Organizations",
                  },
                  {
                    data: analytics.monthLabels.map((label, i) => ({
                      label,
                      value: analytics.projectGrowth[i],
                    })),
                    color: "#a855f7",
                    label: "Projects",
                  },
                ]}
                height={260}
              />
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  New Users Per Month
                </h2>
              </div>
              <BarChart
                data={analytics.monthLabels.map((label, i) => ({
                  label,
                  value: analytics.newUsersPerMonth[i],
                }))}
                color="#3b82f6"
                height={260}
              />
            </Card>
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Tier Distribution
              </h2>
              <DonutChart
                data={Object.entries(analytics.tierDistribution).map(
                  ([label, value]) => ({
                    label: label.charAt(0).toUpperCase() + label.slice(1),
                    value,
                  })
                )}
                size={160}
                totalLabel="Orgs"
              />
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Ticket Status
              </h2>
              <DonutChart
                data={Object.entries(analytics.ticketStatusCounts).map(
                  ([label, value]) => ({ label, value })
                )}
                size={160}
                totalLabel="Tickets"
              />
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Messages
              </h2>
              <DonutChart
                data={[
                  {
                    label: "Read",
                    value: analytics.messagesRead,
                    color: "#10b981",
                  },
                  {
                    label: "Unread",
                    value: analytics.messagesUnread,
                    color: "#f59e0b",
                  },
                ]}
                size={160}
                totalLabel="Messages"
              />
            </Card>
          </div>

          {/* Activity & Feature Requests */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Feature Request Status
              </h2>
              <BarChart
                data={Object.entries(analytics.featureStatusCounts).map(
                  ([label, value]) => ({ label, value })
                )}
                height={220}
              />
            </Card>

            <Card>
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Ticket Categories
              </h2>
              <BarChart
                data={Object.entries(analytics.ticketCategoryCounts).map(
                  ([label, value]) => ({ label, value })
                )}
                height={220}
              />
            </Card>
          </div>

          {/* Monthly Activity */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-zinc-100">
                Monthly Activity
              </h2>
            </div>
            <AreaChart
              series={[
                {
                  data: analytics.monthLabels.map((label, i) => ({
                    label,
                    value: analytics.ticketsPerMonth[i],
                  })),
                  color: "#f59e0b",
                  label: "Tickets",
                },
                {
                  data: analytics.monthLabels.map((label, i) => ({
                    label,
                    value: analytics.messagesPerMonth[i],
                  })),
                  color: "#06b6d4",
                  label: "Messages",
                },
              ]}
              height={220}
            />
          </Card>

          {/* Top Feature Requests */}
          {analytics.topFeatureRequests.length > 0 && (
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                Top Feature Requests by Votes
              </h2>
              <BarChart
                data={analytics.topFeatureRequests.map((fr) => ({
                  label:
                    fr.title.length > 20
                      ? fr.title.slice(0, 18) + "..."
                      : fr.title,
                  value: fr.votes,
                }))}
                height={260}
                color="#a855f7"
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
