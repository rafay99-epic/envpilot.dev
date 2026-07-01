"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAnomalyRules } from "@/hooks/useAnomalyDetection";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalSelect,
  TerminalButton,
  TerminalButtonLink,
  TerminalBadge,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { RequirePermission } from "@/components/auth";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldOff,
  X,
} from "lucide-react";

type Severity = "info" | "warning" | "critical";

const severityBadgeColor: Record<Severity, "blue" | "amber" | "red"> = {
  info: "blue",
  warning: "amber",
  critical: "red",
};

interface RuleFormData {
  ruleId: string;
  displayName: string;
  description: string;
  severity: Severity;
  minHistoryDays: number;
  emailAlertEnabled: boolean;
  alertCooldownMinutes: number;
}

const emptyForm: RuleFormData = {
  ruleId: "",
  displayName: "",
  description: "",
  severity: "warning",
  minHistoryDays: 7,
  emailAlertEnabled: false,
  alertCooldownMinutes: 240,
};

export default function AnomalyRulesPage() {
  const rules = useAnomalyRules();
  const [showForm, setShowForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const createRule = useMutation(api.anomalyDetection.createOrgRule);
  const updateRule = useMutation(api.anomalyDetection.updateOrgRule);
  const deleteRule = useMutation(api.anomalyDetection.deleteOrgRule);
  const toggleRule = useMutation(api.anomalyDetection.updateOrgRule);

  const isLoading = rules === undefined;

  const openCreate = () => {
    setForm(emptyForm);
    setEditingRuleId(null);
    setShowForm(true);
  };

  const openEdit = (rule: {
    ruleId: string;
    displayName: string;
    description: string;
    severity: Severity;
    minHistoryDays: number;
    emailAlertEnabled: boolean;
    alertCooldownMinutes: number;
  }) => {
    setForm({
      ruleId: rule.ruleId,
      displayName: rule.displayName,
      description: rule.description,
      severity: rule.severity,
      minHistoryDays: rule.minHistoryDays,
      emailAlertEnabled: rule.emailAlertEnabled,
      alertCooldownMinutes: rule.alertCooldownMinutes,
    });
    setEditingRuleId(rule.ruleId);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingRuleId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRuleId) {
      await updateRule({
        ruleId: editingRuleId,
        displayName: form.displayName,
        description: form.description,
        severity: form.severity,
        minHistoryDays: form.minHistoryDays,
        emailAlertEnabled: form.emailAlertEnabled,
        alertCooldownMinutes: form.alertCooldownMinutes,
      });
    } else {
      await createRule({
        ruleId: form.ruleId,
        displayName: form.displayName,
        description: form.description,
        severity: form.severity,
        minHistoryDays: form.minHistoryDays,
        emailAlertEnabled: form.emailAlertEnabled,
        alertCooldownMinutes: form.alertCooldownMinutes,
      });
    }
    closeForm();
  };

  const handleDelete = async (ruleId: string) => {
    await deleteRule({ ruleId });
    setConfirmDeleteId(null);
  };

  const handleToggle = async (ruleId: string, isEnabled: boolean) => {
    await toggleRule({ ruleId, isEnabled: !isEnabled });
  };

  return (
    <RequirePermission
      action="org:view_anomalies"
      fallback={
        <TerminalWindow title="Anomaly Rules">
          <TerminalEmptyState
            command="access denied"
            message="Access restricted — anomaly detection is available to owners and project managers only."
          />
        </TerminalWindow>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TerminalButtonLink variant="secondary" href="/dashboard/anomalies">
              <ArrowLeft className="h-4 w-4" />
              Back
            </TerminalButtonLink>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Anomaly Rules</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Configure detection rules for unusual access patterns
              </p>
            </div>
          </div>
          <TerminalButton variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Rule
          </TerminalButton>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <TerminalCard>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h2 className="text-sm font-semibold text-zinc-100">
                {editingRuleId ? "Edit Rule" : "Create Rule"}
              </h2>
              <button
                onClick={closeForm}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!editingRuleId && (
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Rule ID
                    </label>
                    <TerminalInput
                      required
                      placeholder="e.g. my_custom_rule"
                      value={form.ruleId}
                      onChange={(e) =>
                        setForm({ ...form, ruleId: e.target.value })
                      }
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Display Name
                  </label>
                  <TerminalInput
                    required
                    placeholder="e.g. My Custom Rule"
                    value={form.displayName}
                    onChange={(e) =>
                      setForm({ ...form, displayName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Severity
                  </label>
                  <TerminalSelect
                    value={form.severity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        severity: e.target.value as Severity,
                      })
                    }
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </TerminalSelect>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Min History (days)
                  </label>
                  <TerminalInput
                    type="number"
                    min={0}
                    value={form.minHistoryDays}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        minHistoryDays: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Alert Cooldown (minutes)
                  </label>
                  <TerminalInput
                    type="number"
                    min={1}
                    value={form.alertCooldownMinutes}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        alertCooldownMinutes: parseInt(e.target.value) || 60,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Description
                </label>
                <TerminalInput
                  required
                  placeholder="Describe what this rule detects..."
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  <input
                    type="checkbox"
                    checked={form.emailAlertEnabled}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        emailAlertEnabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-green-500 focus:ring-green-500/30"
                  />
                  Send email alerts
                </label>
              </div>
              <div className="flex items-center gap-3">
                <TerminalButton type="submit" variant="primary">
                  {editingRuleId ? "Save Changes" : "Create Rule"}
                </TerminalButton>
                <TerminalButton
                  type="button"
                  variant="secondary"
                  onClick={closeForm}
                >
                  Cancel
                </TerminalButton>
              </div>
            </form>
          </TerminalCard>
        )}

        {/* Rules List */}
        {isLoading ? (
          <TerminalWindow title="anomaly-rules">
            <div className="divide-y divide-zinc-800/50">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-5 w-5 animate-pulse rounded bg-zinc-800" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-32 animate-pulse rounded bg-zinc-800" />
                      <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-800/60" />
                    </div>
                    <div className="h-3 w-56 animate-pulse rounded bg-zinc-800/40" />
                    <div className="flex gap-3">
                      <div className="h-2 w-20 animate-pulse rounded bg-zinc-800/30" />
                      <div className="h-2 w-16 animate-pulse rounded bg-zinc-800/30" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-7 w-7 animate-pulse rounded bg-zinc-800/60" />
                    <div className="h-7 w-7 animate-pulse rounded bg-zinc-800/60" />
                  </div>
                </div>
              ))}
            </div>
          </TerminalWindow>
        ) : rules.length === 0 ? (
          <TerminalWindow title="anomaly-rules">
            <TerminalEmptyState
              command="anomaly-rules --list"
              message="No anomaly rules configured. Create a rule to start detecting unusual access patterns."
              action={{ label: "Create Rule", onClick: openCreate }}
            />
          </TerminalWindow>
        ) : (
          <TerminalWindow title="anomaly-rules">
            <AnimatedList className="divide-y divide-zinc-800/50">
              {rules.map(
                (rule: {
                  _id: string;
                  ruleId: string;
                  displayName: string;
                  description: string;
                  isEnabled: boolean;
                  severity: Severity;
                  minHistoryDays: number;
                  emailAlertEnabled: boolean;
                  alertCooldownMinutes: number;
                }) => (
                  <div
                    key={rule._id}
                    className="flex items-center gap-4 px-5 py-4 font-mono text-xs transition-colors hover:bg-green-500/5"
                  >
                    {/* Enabled indicator */}
                    <button
                      onClick={() => handleToggle(rule.ruleId, rule.isEnabled)}
                      className="shrink-0"
                      title={rule.isEnabled ? "Disable rule" : "Enable rule"}
                    >
                      {rule.isEnabled ? (
                        <ShieldCheck className="h-5 w-5 text-green-400" />
                      ) : (
                        <ShieldOff className="h-5 w-5 text-zinc-600" />
                      )}
                    </button>

                    {/* Rule details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${rule.isEnabled ? "text-zinc-100" : "text-zinc-500"}`}
                        >
                          {rule.displayName}
                        </span>
                        <TerminalBadge
                          color={severityBadgeColor[rule.severity]}
                        >
                          {rule.severity}
                        </TerminalBadge>
                        {!rule.isEnabled && (
                          <TerminalBadge color="zinc">disabled</TerminalBadge>
                        )}
                        {rule.emailAlertEnabled && (
                          <TerminalBadge color="purple">email</TerminalBadge>
                        )}
                      </div>
                      <p className="mt-0.5 text-zinc-500">{rule.description}</p>
                      <div className="mt-1 flex items-center gap-3 text-zinc-600">
                        <span>id: {rule.ruleId}</span>
                        <span>history: {rule.minHistoryDays}d</span>
                        <span>cooldown: {rule.alertCooldownMinutes}m</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => openEdit(rule)}
                        className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                        title="Edit rule"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {confirmDeleteId === rule.ruleId ? (
                        <div className="flex items-center gap-1">
                          <TerminalButton
                            variant="danger"
                            className="text-xs"
                            onClick={() => handleDelete(rule.ruleId)}
                          >
                            Confirm
                          </TerminalButton>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded p-1.5 text-zinc-500 hover:text-zinc-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(rule.ruleId)}
                          className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                          title="Delete rule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </AnimatedList>
          </TerminalWindow>
        )}
      </div>
    </RequirePermission>
  );
}
