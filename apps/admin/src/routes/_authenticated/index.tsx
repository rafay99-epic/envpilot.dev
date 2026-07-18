import { createFileRoute } from "@tanstack/react-router";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { QueryState } from "@/components/ui/QueryState";
import { BarChart, DonutChart, AreaChart } from "@/components/ui/charts";
import { useConfirmStore } from "@/stores/confirm-store";
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
  CreditCard,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

// Chart accent palette — green (primary), amber, red plus a couple of
// supporting hues, kept consistent across the dashboard's charts.
const CHART_GREEN = "#22c55e";
const CHART_AMBER = "#f59e0b";
const CHART_BLUE = "#3b82f6";
const CHART_PURPLE = "#a855f7";

// ==========================================
// READINESS ITEM
// ==========================================

function ReadinessItem({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
      )}
      <span className="text-zinc-300">{label}</span>
      {detail && (
        <span className="ml-auto text-xs text-zinc-500">{detail}</span>
      )}
    </div>
  );
}

// ==========================================
// DASHBOARD
// ==========================================

function DashboardPage() {
  const stats = useAdminQuery(api.features.admin.stats.getStats, {});
  const analytics = useAdminQuery(api.features.admin.stats.getAnalytics, {});
  const settings = useAdminQuery(
    api.features.admin.settings.getAdminSettings,
    {}
  );
  const updateSetting = useAdminMutation(
    api.features.admin.settings.updateAdminSetting
  );
  const paymentReadiness = useAdminQuery(
    api.features.admin.stats.getPaymentReadiness,
    {}
  );
  const { confirm } = useConfirmStore();

  const tierEnforcement = settings?.tierEnforcement === "true";
  const paymentsEnabled = settings?.paymentsEnabled === "true";

  const handleToggleEnforcement = async () => {
    await updateSetting({
      key: "tierEnforcement",
      value: tierEnforcement ? "false" : "true",
    });
  };

  const handleTogglePayments = async () => {
    // When enabling: validate prerequisites
    if (!paymentsEnabled) {
      if (!paymentReadiness?.canEnable) {
        return;
      }
    }

    // When disabling: warn about active subscribers
    if (
      paymentsEnabled &&
      paymentReadiness &&
      paymentReadiness.activeSubscriptionCount > 0
    ) {
      const ok = await confirm({
        title: "Disable Payment Gateway?",
        message: `There are ${paymentReadiness.activeSubscriptionCount} active subscription(s). Disabling payments will prevent new checkouts and billing management. Existing subscriptions will continue via Polar until canceled. Continue?`,
        confirmLabel: "Disable Payments",
        cancelLabel: "Keep Enabled",
        variant: "warning",
      });
      if (!ok) return;
    }

    await updateSetting({
      key: "paymentsEnabled",
      value: paymentsEnabled ? "false" : "true",
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>

        <div className="flex items-center gap-3">
          {/* Payment Gateway Toggle */}
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
            <CreditCard className="h-4 w-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">Payments</span>
            <Switch
              checked={paymentsEnabled}
              onChange={handleTogglePayments}
              disabled={
                !settings || (!paymentReadiness?.canEnable && !paymentsEnabled)
              }
              size="sm"
              id="payments-toggle"
            />
            <Badge variant={paymentsEnabled ? "success" : "default"}>
              {paymentsEnabled ? "Active" : "Disabled"}
            </Badge>
          </div>

          {/* Tier Enforcement Toggle */}
          <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
            <Shield className="h-4 w-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">Tier Enforcement</span>
            <Switch
              checked={tierEnforcement}
              onChange={handleToggleEnforcement}
              disabled={!settings}
              size="sm"
              id="tier-enforcement-toggle"
            />
            <Badge variant={tierEnforcement ? "success" : "default"}>
              {tierEnforcement ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Production Readiness Checklist */}
      <Card title="payment-readiness">
        <QueryState data={paymentReadiness} loadingLabel="Checking readiness…">
          {(readiness) => (
            <>
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-green-500" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  Payment System Readiness
                </h2>
              </div>
              <div className="space-y-2.5">
                <ReadinessItem
                  label="Payment products configured"
                  ok={readiness.paymentProductsSeeded}
                  detail={
                    readiness.tiersWithProducts
                      .map(
                        (t) =>
                          `${t.displayName}: ${t.hasActiveProduct ? "✓" : "missing"}`
                      )
                      .join(", ") || "No paid tiers"
                  }
                />
                <ReadinessItem
                  label="All paid tiers have products"
                  ok={readiness.allPaidTiersConfigured}
                />
                <ReadinessItem
                  label="Payment gateway"
                  ok={readiness.paymentsEnabled}
                  detail={readiness.paymentsEnabled ? "Enabled" : "Disabled"}
                />
                <ReadinessItem
                  label="Tier enforcement"
                  ok={tierEnforcement}
                  detail={tierEnforcement ? "Active" : "Disabled"}
                />
                <ReadinessItem
                  label="Active subscribers"
                  ok={true}
                  detail={`${readiness.activeSubscriptionCount} subscription(s)`}
                />
              </div>
              {!readiness.canEnable && !readiness.paymentsEnabled && (
                <p className="mt-3 text-xs text-amber-400">
                  Configure payment products in Tiers &amp; Limits → Payment
                  Products before enabling payments. Run the
                  "seed-payment-products" migration from the Migrations page to
                  auto-populate from tier definitions.
                </p>
              )}
            </>
          )}
        </QueryState>
      </Card>

      {/* Stat Cards */}
      <QueryState data={stats} loadingLabel="Loading stats…">
        {(s) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Users"
              value={s.totalUsers}
              icon={<Users className="h-5 w-5" />}
              trend={
                analytics
                  ? `+${analytics.recent30d.users} this month`
                  : undefined
              }
            />
            <StatCard
              title="Organizations"
              value={s.totalOrganizations}
              icon={<Building2 className="h-5 w-5" />}
              trend={
                analytics
                  ? `+${analytics.recent30d.organizations} this month`
                  : undefined
              }
            />
            <StatCard
              title="Projects"
              value={s.totalProjects}
              icon={<FolderOpen className="h-5 w-5" />}
              trend={
                analytics
                  ? `+${analytics.recent30d.projects} this month`
                  : undefined
              }
            />
            <StatCard
              title="Unread Messages"
              value={s.unreadMessages}
              icon={<Mail className="h-5 w-5" />}
            />
            <StatCard
              title="Open Tickets"
              value={s.openTickets}
              icon={<Ticket className="h-5 w-5" />}
              trend={
                analytics
                  ? `+${analytics.recent30d.tickets} this month`
                  : undefined
              }
            />
            <StatCard
              title="Feature Requests"
              value={s.totalFeatureRequests}
              icon={<Lightbulb className="h-5 w-5" />}
            />
            {Object.entries(s.tierDistribution).map(([tierName, count]) => (
              <StatCard
                key={tierName}
                title={`${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Tier`}
                value={count}
                icon={<Crown className="h-5 w-5" />}
                trend="organizations"
              />
            ))}
          </div>
        )}
      </QueryState>

      {/* Charts section */}
      <QueryState data={analytics} loadingLabel="Loading analytics…">
        {(a) => (
          <>
            {/* Growth Charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <h2 className="text-sm font-semibold text-zinc-100">
                    Platform Growth
                  </h2>
                </div>
                <AreaChart
                  series={[
                    {
                      data: a.monthLabels.map((label, i) => ({
                        label,
                        value: a.userGrowth[i],
                      })),
                      color: CHART_GREEN,
                      label: "Users",
                    },
                    {
                      data: a.monthLabels.map((label, i) => ({
                        label,
                        value: a.orgGrowth[i],
                      })),
                      color: CHART_BLUE,
                      label: "Organizations",
                    },
                    {
                      data: a.monthLabels.map((label, i) => ({
                        label,
                        value: a.projectGrowth[i],
                      })),
                      color: CHART_PURPLE,
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
                  data={a.monthLabels.map((label, i) => ({
                    label,
                    value: a.newUsersPerMonth[i],
                  }))}
                  color={CHART_GREEN}
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
                  data={Object.entries(a.tierDistribution).map(
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
                  data={Object.entries(a.ticketStatusCounts).map(
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
                      value: a.messagesRead,
                      color: CHART_GREEN,
                    },
                    {
                      label: "Unread",
                      value: a.messagesUnread,
                      color: CHART_AMBER,
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
                  data={Object.entries(a.featureStatusCounts).map(
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
                  data={Object.entries(a.ticketCategoryCounts).map(
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
                    data: a.monthLabels.map((label, i) => ({
                      label,
                      value: a.ticketsPerMonth[i],
                    })),
                    color: CHART_AMBER,
                    label: "Tickets",
                  },
                  {
                    data: a.monthLabels.map((label, i) => ({
                      label,
                      value: a.messagesPerMonth[i],
                    })),
                    color: CHART_BLUE,
                    label: "Messages",
                  },
                ]}
                height={220}
              />
            </Card>

            {/* Top Feature Requests */}
            {a.topFeatureRequests.length > 0 && (
              <Card>
                <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                  Top Feature Requests by Votes
                </h2>
                <BarChart
                  data={a.topFeatureRequests.map((fr) => ({
                    label:
                      fr.title.length > 20
                        ? fr.title.slice(0, 18) + "..."
                        : fr.title,
                    value: fr.votes,
                  }))}
                  height={260}
                  color={CHART_PURPLE}
                />
              </Card>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
