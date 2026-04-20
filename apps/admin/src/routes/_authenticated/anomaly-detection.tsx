import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import {
  ShieldAlert,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Pencil,
  X,
  Activity,
  Shield,
  BookOpen,
  Play,
  FlaskConical,
  CircleCheck,
  CircleX,
  CircleDashed,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/anomaly-detection")({
  component: AnomalyDetectionPage,
});

// ==========================================
// TYPES
// ==========================================

type Tab = "events" | "rules" | "test" | "settings";

type EventStatus = "open" | "acknowledged" | "dismissed" | "resolved";

type Severity = "info" | "warning" | "critical";

interface RuleEditState {
  ruleId: string;
  isEnabled: boolean;
  severity: Severity;
  alertCooldownMinutes: number;
  emailAlertEnabled: boolean;
}

// ==========================================
// HELPERS
// ==========================================

function severityBadgeVariant(severity: string) {
  switch (severity) {
    case "critical":
      return "danger" as const;
    case "warning":
      return "warning" as const;
    case "info":
      return "info" as const;
    default:
      return "default" as const;
  }
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "open":
      return "danger" as const;
    case "acknowledged":
      return "warning" as const;
    case "resolved":
      return "success" as const;
    case "dismissed":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
    case "warning":
      return <AlertCircle className="h-3.5 w-3.5 text-amber-400" />;
    case "info":
      return <Info className="h-3.5 w-3.5 text-blue-400" />;
    default:
      return null;
  }
}

// ==========================================
// MAIN PAGE
// ==========================================

function AnomalyDetectionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("events");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "events",
      label: "Events",
      icon: <Activity className="h-4 w-4" />,
    },
    {
      key: "rules",
      label: "Global Rules",
      icon: <BookOpen className="h-4 w-4" />,
    },
    {
      key: "test",
      label: "Test Suite",
      icon: <FlaskConical className="h-4 w-4" />,
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Shield className="h-4 w-4" />,
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-emerald-400" />
        <h1 className="text-2xl font-semibold text-zinc-100">
          Anomaly Detection
        </h1>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-emerald-600/15 text-emerald-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "events" && <EventsTab />}
      {activeTab === "rules" && <RulesTab />}
      {activeTab === "test" && <TestSuiteTab />}
      {activeTab === "settings" && <SettingsTab />}
    </div>
  );
}

// ==========================================
// EVENTS TAB
// ==========================================

function EventsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resolving, setResolving] = useState<string | null>(null);

  const filterStatus =
    statusFilter === "all" ? undefined : (statusFilter as EventStatus);
  const events = useAdminQuery(api.admin.listAllAnomalyEvents, {
    status: filterStatus,
    limit: 100,
  });
  const resolveEvent = useAdminMutation(api.admin.resolveAnomalyEvent);

  const handleResolve = async (
    eventId: Id<"anomalyEvents">,
    status: "acknowledged" | "dismissed" | "resolved"
  ) => {
    setResolving(eventId);
    try {
      await resolveEvent({ anomalyEventId: eventId, status });
      toast("success", `Event ${status}`);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to resolve event"
      );
    } finally {
      setResolving(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Anomaly Events</h2>
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "open", label: "Open" },
              { value: "acknowledged", label: "Acknowledged" },
              { value: "dismissed", label: "Dismissed" },
              { value: "resolved", label: "Resolved" },
            ]}
          />
        </div>
      </div>

      {!events ? (
        <Spinner />
      ) : events.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm text-zinc-400">
            No anomaly events found
            {statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Organization
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  User
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Rule
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Severity
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Description
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Detected
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event._id}
                  className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
                >
                  <td className="px-4 py-2 text-xs text-zinc-300">
                    {event.orgName}
                  </td>
                  <td className="px-4 py-2">
                    <div>
                      <p className="text-xs text-zinc-300">{event.userName}</p>
                      <p className="text-[10px] text-zinc-500">
                        {event.userEmail}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-300">
                    {event.ruleName}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant={severityBadgeVariant(event.severity)}>
                      <span className="flex items-center gap-1">
                        <SeverityIcon severity={event.severity} />
                        {event.severity}
                      </span>
                    </Badge>
                  </td>
                  <td className="max-w-xs px-4 py-2 text-xs text-zinc-400">
                    <span className="line-clamp-2">
                      {event.parsedDetails?.description ??
                        event.parsedDetails?.reason ??
                        event.ruleId}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant={statusBadgeVariant(event.status)}>
                      {event.status}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-400">
                    {formatDateTime(event.detectedAt)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {event.status === "open" ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() =>
                            handleResolve(
                              event._id as Id<"anomalyEvents">,
                              "resolved"
                            )
                          }
                          disabled={resolving === event._id}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                          title="Resolve"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Resolve
                        </button>
                        <button
                          onClick={() =>
                            handleResolve(
                              event._id as Id<"anomalyEvents">,
                              "dismissed"
                            )
                          }
                          disabled={resolving === event._id}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 disabled:opacity-50"
                          title="Dismiss"
                        >
                          <X className="h-3 w-3" />
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// RULES TAB
// ==========================================

function RulesTab() {
  const rules = useAdminQuery(api.admin.listAnomalyRules, {});
  const updateRule = useAdminMutation(api.admin.updateAnomalyRule);

  const [editingRule, setEditingRule] = useState<RuleEditState | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = (rule: NonNullable<typeof rules>[number]) => {
    setEditingRule({
      ruleId: rule.ruleId,
      isEnabled: rule.isEnabled,
      severity: rule.severity,
      alertCooldownMinutes: rule.alertCooldownMinutes,
      emailAlertEnabled: rule.emailAlertEnabled,
    });
  };

  const cancelEdit = () => {
    setEditingRule(null);
  };

  const handleSave = async () => {
    if (!editingRule) return;
    setSaving(true);
    try {
      await updateRule({
        ruleId: editingRule.ruleId,
        isEnabled: editingRule.isEnabled,
        severity: editingRule.severity,
        alertCooldownMinutes: editingRule.alertCooldownMinutes,
        emailAlertEnabled: editingRule.emailAlertEnabled,
      });
      toast("success", "Rule updated");
      setEditingRule(null);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update rule"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">
          Global Anomaly Rules
        </h2>
        <p className="text-xs text-zinc-500">
          Configure detection rules that apply across all organizations. Changes
          take effect immediately.
        </p>
      </div>

      {!rules ? (
        <Spinner />
      ) : rules.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm text-zinc-400">
            No anomaly rules found. Run the seed migration to populate default
            rules.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                  Description
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Severity
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Email Alerts
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Cooldown
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Enabled
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const isEditing = editingRule?.ruleId === rule.ruleId;

                return (
                  <tr
                    key={rule._id}
                    className={`border-b border-zinc-800/30 hover:bg-zinc-800/20 ${
                      isEditing ? "bg-zinc-800/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      <div>
                        <p className="text-xs font-medium text-zinc-200">
                          {rule.displayName}
                        </p>
                        <p className="font-mono text-[10px] text-zinc-500">
                          {rule.ruleId}
                        </p>
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-2 text-xs text-zinc-400">
                      {rule.description}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isEditing ? (
                        <select
                          value={editingRule.severity}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              severity: e.target.value as Severity,
                            })
                          }
                          className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="info">Info</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                        </select>
                      ) : (
                        <Badge variant={severityBadgeVariant(rule.severity)}>
                          <span className="flex items-center gap-1">
                            <SeverityIcon severity={rule.severity} />
                            {rule.severity}
                          </span>
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isEditing ? (
                        <button
                          onClick={() =>
                            setEditingRule({
                              ...editingRule,
                              emailAlertEnabled: !editingRule.emailAlertEnabled,
                            })
                          }
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            editingRule.emailAlertEnabled
                              ? "bg-emerald-600"
                              : "bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                              editingRule.emailAlertEnabled
                                ? "translate-x-5"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      ) : (
                        <Badge
                          variant={
                            rule.emailAlertEnabled ? "success" : "default"
                          }
                        >
                          {rule.emailAlertEnabled ? "On" : "Off"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={editingRule.alertCooldownMinutes}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              alertCooldownMinutes:
                                parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-20 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-center text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">
                          {rule.alertCooldownMinutes}m
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isEditing ? (
                        <button
                          onClick={() =>
                            setEditingRule({
                              ...editingRule,
                              isEnabled: !editingRule.isEnabled,
                            })
                          }
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            editingRule.isEnabled
                              ? "bg-emerald-600"
                              : "bg-zinc-700"
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                              editingRule.isEnabled
                                ? "translate-x-5"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      ) : (
                        <Badge variant={rule.isEnabled ? "success" : "default"}>
                          {rule.isEnabled ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                          >
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => openEdit(rule)}
                          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                          title="Edit rule"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// TEST SUITE TAB
// ==========================================

interface TestResult {
  id: string;
  rule: string;
  description: string;
  expectFire: boolean;
  actuallyFired: boolean;
  passed: boolean;
  anomalyDetails: Record<string, unknown> | null;
}

interface TestReport {
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  cleanup: {
    anomalyEventsDeleted: number;
    testAuditLogsDeleted: number;
  };
  seeded: {
    baselineCreated: boolean;
    velocityLogsCreated: number;
  };
  anomalyEventsCreated: number;
  featureGateStatus: string;
}

function TestSuiteTab() {
  const runTest = useAdminMutation(api.admin.runAnomalyTest);
  const cleanupTest = useAdminMutation(api.admin.cleanupAnomalyTestData);
  const [running, setRunning] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [report, setReport] = useState<TestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCleanup = async () => {
    setCleaningUp(true);
    try {
      const result = (await cleanupTest({})) as {
        eventsDeleted: number;
        logsDeleted: number;
      };
      toast(
        "success",
        `Cleaned up ${result.eventsDeleted} test events, ${result.logsDeleted} test logs. Baseline kept.`
      );
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setCleaningUp(false);
    }
  };

  const handleRunTest = async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const result = (await runTest({})) as TestReport;
      setReport(result);
      const { passed, failed, skipped } = result.summary;
      if (failed === 0) {
        toast(
          "success",
          `All tests passed! ${passed} passed, ${skipped} skipped`
        );
      } else {
        toast("error", `${failed} test(s) failed, ${passed} passed`);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Test suite failed to run";
      setError(msg);
      toast("error", msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Anomaly Detection Test Suite
          </h2>
          <p className="text-xs text-zinc-500">
            Run automated tests against the detection engine. Seeds controlled
            baselines and audit logs for the Syntax Lab Technology org,
            evaluates all rules with positive and negative scenarios, and
            reports pass/fail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={handleCleanup}
            disabled={cleaningUp || running}
          >
            {cleaningUp ? (
              <>
                <Spinner className="h-4 w-4" />
                Cleaning...
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                Cleanup Test Data
              </>
            )}
          </Button>
          <Button onClick={handleRunTest} disabled={running || cleaningUp}>
            {running ? (
              <>
                <Spinner className="h-4 w-4" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Tests
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="mb-6 border-red-500/30 bg-red-500/5">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {/* Report */}
      {report && (
        <>
          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              title="Total"
              value={report.summary.total}
              icon={<FlaskConical className="h-5 w-5" />}
            />
            <StatCard
              title="Passed"
              value={report.summary.passed}
              icon={<CircleCheck className="h-5 w-5 text-emerald-400" />}
            />
            <StatCard
              title="Failed"
              value={report.summary.failed}
              icon={<CircleX className="h-5 w-5 text-red-400" />}
            />
            <StatCard
              title="Skipped"
              value={report.summary.skipped}
              icon={<CircleDashed className="h-5 w-5 text-zinc-400" />}
            />
          </div>

          {/* Meta info */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Feature Gate
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                {report.featureGateStatus}
              </p>
            </Card>
            <Card>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Cleanup
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                {report.cleanup.anomalyEventsDeleted} events,{" "}
                {report.cleanup.testAuditLogsDeleted} audit logs removed
              </p>
            </Card>
            <Card>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Seeded Data
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                Baseline: {report.seeded.baselineCreated ? "Yes" : "No"},{" "}
                {report.seeded.velocityLogsCreated} velocity logs
              </p>
            </Card>
            <Card>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Anomaly Events Created
              </p>
              <p className="mt-1 text-sm text-zinc-200">
                {report.anomalyEventsCreated} (visible in Events tab)
              </p>
            </Card>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Test ID
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Rule
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Description
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Expected
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-400">
                    Actual
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((result) => {
                  const isSkipped = result.anomalyDetails?.__skipped === true;

                  return (
                    <tr
                      key={result.id}
                      className={`border-b border-zinc-800/30 ${
                        isSkipped
                          ? "bg-zinc-800/10"
                          : result.passed
                            ? "bg-emerald-500/5"
                            : "bg-red-500/5"
                      }`}
                    >
                      <td className="px-4 py-2 text-center">
                        {isSkipped ? (
                          <CircleDashed className="mx-auto h-4 w-4 text-zinc-500" />
                        ) : result.passed ? (
                          <CircleCheck className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <CircleX className="mx-auto h-4 w-4 text-red-400" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-zinc-300">
                        {result.id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-300">
                        {result.rule}
                      </td>
                      <td className="max-w-xs px-4 py-2 text-xs text-zinc-400">
                        {result.description}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Badge
                          variant={result.expectFire ? "warning" : "default"}
                        >
                          {result.expectFire ? "FIRE" : "SILENT"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Badge
                          variant={
                            isSkipped
                              ? "default"
                              : result.actuallyFired
                                ? "warning"
                                : "info"
                          }
                        >
                          {isSkipped
                            ? "SKIP"
                            : result.actuallyFired
                              ? "FIRED"
                              : "SILENT"}
                        </Badge>
                      </td>
                      <td className="max-w-sm px-4 py-2 text-xs text-zinc-500">
                        {isSkipped ? (
                          <span className="italic">
                            {(result.anomalyDetails?.reason as string) ?? "—"}
                          </span>
                        ) : result.anomalyDetails ? (
                          <span className="line-clamp-2">
                            {(result.anomalyDetails.message as string) ??
                              JSON.stringify(result.anomalyDetails)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty State */}
      {!report && !error && !running && (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="mb-3 h-10 w-10 text-zinc-600" />
            <h3 className="text-sm font-medium text-zinc-300">
              No test results yet
            </h3>
            <p className="mt-1 max-w-sm text-xs text-zinc-500">
              Click &quot;Run Tests&quot; to execute the anomaly detection test
              suite. The test seeds controlled data and evaluates all 6 rules
              with positive/negative scenarios.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ==========================================
// SETTINGS TAB
// ==========================================

function SettingsTab() {
  const stats = useAdminQuery(api.admin.getAnomalyStats, {});

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-100">
          Anomaly Detection Overview
        </h2>
        <p className="text-xs text-zinc-500">
          System-wide anomaly detection statistics and configuration status.
        </p>
      </div>

      {!stats ? (
        <Spinner />
      ) : (
        <>
          {/* Open Events Summary */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Open Events"
              value={stats.openTotal}
              icon={<Activity className="h-5 w-5" />}
            />
            <StatCard
              title="Critical"
              value={stats.openCritical}
              icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
            />
            <StatCard
              title="Warnings"
              value={stats.openWarning}
              icon={<AlertCircle className="h-5 w-5 text-amber-400" />}
            />
            <StatCard
              title="Info"
              value={stats.openInfo}
              icon={<Info className="h-5 w-5 text-blue-400" />}
            />
          </div>

          {/* System Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Total Baselines"
              value={stats.totalBaselines}
              icon={<Shield className="h-5 w-5" />}
              trend="User access patterns tracked"
            />
            <StatCard
              title="Total Rules"
              value={stats.totalRules}
              icon={<BookOpen className="h-5 w-5" />}
              trend={`${stats.enabledRules} of ${stats.totalRules} enabled`}
            />
            <StatCard
              title="Enabled Rules"
              value={stats.enabledRules}
              icon={<CheckCircle className="h-5 w-5 text-emerald-400" />}
              trend="Currently active detection rules"
            />
          </div>
        </>
      )}
    </div>
  );
}
