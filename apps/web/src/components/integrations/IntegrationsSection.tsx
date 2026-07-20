"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { sanitizeConvexError } from "@/lib/error-messages";
import { Plus, Send, Trash2 } from "lucide-react";

/**
 * Organization notification webhooks (Slack / Discord).
 *
 * Primary path: OAuth connect buttons — the platform's consent screen picks
 * the channel and hands back the webhook URL, nothing to copy-paste. The
 * buttons only render when the server has the provider's OAuth app
 * configured (/api/integrations/providers). Manual URL entry is the
 * always-available fallback.
 */

const EVENT_GROUPS: { key: string; label: string; hint: string }[] = [
  { key: "variables", label: "Variables", hint: "created, updated, deleted" },
  { key: "requests", label: "Requests", hint: "filed, approved, rejected" },
  { key: "members", label: "Members", hint: "invites, removals, permissions" },
  { key: "security", label: "Security", hint: "denials, token changes" },
];
const DEFAULT_GROUPS = ["variables", "requests"];

type WebhookRow = {
  _id: Id<"orgWebhooks">;
  name: string;
  type: "slack" | "discord";
  source: "oauth" | "manual";
  channel: string | null;
  urlPreview: string;
  eventGroups: string[];
  enabled: boolean;
  failCount: number;
  lastStatus: number | null;
  lastSentAt: number | null;
  createdAt: number;
};

function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function IntegrationsSection({
  organizationId,
  slug,
}: {
  organizationId: Id<"organizations">;
  slug: string;
}) {
  const webhooks = useQuery(
    api.features.integrations.webhooks.listForOrganization,
    { organizationId }
  );
  const createHook = useMutation(api.features.integrations.webhooks.create);
  const updateHook = useMutation(api.features.integrations.webhooks.update);
  const removeHook = useMutation(api.features.integrations.webhooks.remove);
  const sendTest = useMutation(api.features.integrations.webhooks.sendTest);

  // Which OAuth providers the server has configured
  const [providers, setProviders] = useState<{
    slack: boolean;
    discord: boolean;
  }>({ slack: false, discord: false });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/providers")
      .then((r) => (r.ok ? r.json() : { slack: false, discord: false }))
      .then((p) => {
        if (!cancelled) setProviders(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Notices (mirrors the Tags tab pattern), incl. OAuth redirect results
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showError = useCallback((msg: string) => {
    setError(msg);
    setSuccess(null);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 6000);
  }, []);
  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg);
    setError(null);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccess(null), 4000);
  }, []);
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("integration_error");
    if (connected === "slack" || connected === "discord") {
      showSuccess(
        `${connected === "slack" ? "Slack" : "Discord"} connected — a test message was sent to the channel.`
      );
    } else if (oauthError) {
      showError(oauthError);
    }
    // Run once for the landing URL; params never change without a navigation.
  }, []);
  useEffect(
    () => () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    []
  );

  // Manual add form
  const [showManual, setShowManual] = useState(false);
  const [manualType, setManualType] = useState<"slack" | "discord">("slack");
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualGroups, setManualGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [isCreating, setIsCreating] = useState(false);

  // Per-row UI state
  const [editingEventsId, setEditingEventsId] = useState<string | null>(null);
  const [editGroups, setEditGroups] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const toggleGroup = (groups: string[], key: string): string[] =>
    groups.includes(key) ? groups.filter((g) => g !== key) : [...groups, key];

  const startConnect = (provider: "slack" | "discord") => {
    window.location.href = `/api/integrations/${provider}/start?organizationId=${organizationId}&slug=${encodeURIComponent(slug)}`;
  };

  const handleManualCreate = async () => {
    if (!manualName.trim() || !manualUrl.trim() || manualGroups.length === 0)
      return;
    setIsCreating(true);
    try {
      await createHook({
        organizationId,
        name: manualName.trim(),
        type: manualType,
        source: "manual",
        url: manualUrl.trim(),
        eventGroups: manualGroups,
      });
      setShowManual(false);
      setManualName("");
      setManualUrl("");
      setManualGroups(DEFAULT_GROUPS);
      showSuccess("Webhook added — a test message was sent to the channel.");
    } catch (err) {
      showError(sanitizeConvexError(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEvents = async (webhookId: Id<"orgWebhooks">) => {
    try {
      await updateHook({ webhookId, eventGroups: editGroups });
      setEditingEventsId(null);
      showSuccess("Event subscriptions updated");
    } catch (err) {
      showError(sanitizeConvexError(err));
    }
  };

  const handleToggleEnabled = async (hook: WebhookRow) => {
    try {
      await updateHook({ webhookId: hook._id, enabled: !hook.enabled });
      showSuccess(hook.enabled ? "Webhook paused" : "Webhook re-enabled");
    } catch (err) {
      showError(sanitizeConvexError(err));
    }
  };

  const handleRemove = async (webhookId: Id<"orgWebhooks">) => {
    try {
      await removeHook({ webhookId });
      setDeletingId(null);
      showSuccess("Webhook removed");
    } catch (err) {
      showError(sanitizeConvexError(err));
    }
  };

  const handleSendTest = async (webhookId: Id<"orgWebhooks">) => {
    setTestingId(webhookId);
    try {
      await sendTest({ webhookId });
      showSuccess("Test message sent — check the channel.");
    } catch (err) {
      showError(sanitizeConvexError(err));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <FeatureGate
      organizationId={organizationId}
      featureKey="team_notifications"
      featureName="Slack & Discord Notifications"
    >
      <div className="space-y-6">
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-4 shrink-0 text-xs text-red-400/60 hover:text-red-400"
            >
              Dismiss
            </button>
          </div>
        )}
        {success && (
          <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
            <p className="text-sm text-green-400">{success}</p>
            <button
              onClick={() => setSuccess(null)}
              className="ml-4 shrink-0 text-xs text-green-400/60 hover:text-green-400"
            >
              Dismiss
            </button>
          </div>
        )}

        <TerminalCard>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                Notification Channels
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Send organization activity — variable changes, access requests,
                security events — to Slack or Discord. Messages carry key names
                and environments, never secret values.
              </p>
            </div>
          </div>

          {/* Connect buttons (OAuth) + manual fallback */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {providers.slack && (
              <TerminalButton onClick={() => startConnect("slack")}>
                Connect Slack
              </TerminalButton>
            )}
            {providers.discord && (
              <TerminalButton onClick={() => startConnect("discord")}>
                Connect Discord
              </TerminalButton>
            )}
            <TerminalButton
              variant="secondary"
              onClick={() => setShowManual((s) => !s)}
              data-testid="add-webhook-manually"
            >
              <Plus className="h-4 w-4" />
              {providers.slack || providers.discord
                ? "Add manually"
                : "Add webhook"}
            </TerminalButton>
          </div>

          {/* Manual add form */}
          {showManual && (
            <div
              data-testid="manual-webhook-form"
              className="mt-4 space-y-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4"
            >
              <div className="flex gap-2">
                {(["slack", "discord"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setManualType(t)}
                    className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                      manualType === t
                        ? "border-green-500/50 bg-green-500/10 text-green-400"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  Name
                </label>
                <TerminalInput
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="#eng-alerts"
                  maxLength={100}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  Webhook URL
                </label>
                <TerminalInput
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder={
                    manualType === "slack"
                      ? "https://hooks.slack.com/services/..."
                      : "https://discord.com/api/webhooks/..."
                  }
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-zinc-600">
                  {manualType === "slack"
                    ? "Slack: channel → Integrations → Add an app → Incoming Webhooks."
                    : "Discord: channel settings → Integrations → Webhooks → New Webhook → Copy URL."}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  Events
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {EVENT_GROUPS.map((g) => (
                    <label
                      key={g.key}
                      className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300"
                    >
                      <input
                        type="checkbox"
                        checked={manualGroups.includes(g.key)}
                        onChange={() =>
                          setManualGroups((prev) => toggleGroup(prev, g.key))
                        }
                        className="mt-0.5 accent-green-500"
                      />
                      <span>
                        {g.label}
                        <span className="ml-1 text-xs text-zinc-600">
                          {g.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <TerminalButton
                  variant="secondary"
                  onClick={() => setShowManual(false)}
                >
                  Cancel
                </TerminalButton>
                <TerminalButton
                  onClick={handleManualCreate}
                  disabled={
                    !manualName.trim() ||
                    !manualUrl.trim() ||
                    manualGroups.length === 0 ||
                    isCreating
                  }
                >
                  {isCreating ? "Adding..." : "Add Webhook"}
                </TerminalButton>
              </div>
            </div>
          )}

          {/* Webhook list */}
          <div className="mt-6">
            {webhooks === undefined ? (
              <TerminalLoading />
            ) : webhooks.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">
                No channels connected yet.
                {providers.slack || providers.discord
                  ? " Connect Slack or Discord to get activity where your team already is."
                  : " Add a webhook URL to get activity where your team already is."}
              </p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {(webhooks as WebhookRow[]).map((hook) => (
                  <div key={hook._id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          !hook.enabled
                            ? "bg-red-400"
                            : hook.failCount > 0
                              ? "bg-amber-400"
                              : "bg-green-400"
                        }`}
                        title={
                          !hook.enabled
                            ? "Disabled"
                            : hook.failCount > 0
                              ? `${hook.failCount} recent failures (auto-disables at 20)`
                              : "Healthy"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-100">
                            {hook.name}
                          </span>
                          <TerminalBadge
                            color={hook.type === "slack" ? "green" : "blue"}
                          >
                            {hook.type}
                          </TerminalBadge>
                        </div>
                        <p className="mt-0.5 truncate font-mono text-xs text-zinc-600">
                          {hook.source === "oauth" && hook.channel
                            ? hook.channel
                            : hook.urlPreview}
                          {" · "}
                          {hook.eventGroups.join(", ")}
                          {hook.lastSentAt
                            ? ` · last sent ${relativeTime(hook.lastSentAt)}`
                            : ""}
                          {!hook.enabled && hook.failCount >= 20
                            ? " · auto-disabled after repeated failures"
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingEventsId(
                              editingEventsId === hook._id ? null : hook._id
                            );
                            setEditGroups(hook.eventGroups);
                          }}
                          className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
                        >
                          Events
                        </button>
                        <button
                          onClick={() => handleToggleEnabled(hook)}
                          className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
                        >
                          {hook.enabled ? "Pause" : "Resume"}
                        </button>
                        <button
                          onClick={() => handleSendTest(hook._id)}
                          disabled={testingId === hook._id}
                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400 disabled:opacity-50"
                          title="Send test message"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(hook._id)}
                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                          title="Remove webhook"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {editingEventsId === hook._id && (
                      <div className="ml-6 mt-3 space-y-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {EVENT_GROUPS.map((g) => (
                            <label
                              key={g.key}
                              className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300"
                            >
                              <input
                                type="checkbox"
                                checked={editGroups.includes(g.key)}
                                onChange={() =>
                                  setEditGroups((prev) =>
                                    toggleGroup(prev, g.key)
                                  )
                                }
                                className="mt-0.5 accent-green-500"
                              />
                              <span>
                                {g.label}
                                <span className="ml-1 text-xs text-zinc-600">
                                  {g.hint}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-end gap-2">
                          <TerminalButton
                            variant="secondary"
                            onClick={() => setEditingEventsId(null)}
                          >
                            Cancel
                          </TerminalButton>
                          <TerminalButton
                            onClick={() => handleSaveEvents(hook._id)}
                            disabled={editGroups.length === 0}
                          >
                            Save
                          </TerminalButton>
                        </div>
                      </div>
                    )}

                    {deletingId === hook._id && (
                      <div className="ml-6 mt-3 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                        <p className="text-sm text-red-400">
                          Remove &ldquo;{hook.name}&rdquo;? Notifications to
                          this channel stop immediately.
                        </p>
                        <div className="flex shrink-0 gap-2">
                          <TerminalButton
                            variant="secondary"
                            onClick={() => setDeletingId(null)}
                          >
                            Cancel
                          </TerminalButton>
                          <TerminalButton
                            variant="danger"
                            onClick={() => handleRemove(hook._id)}
                          >
                            Remove
                          </TerminalButton>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TerminalCard>
      </div>
    </FeatureGate>
  );
}
