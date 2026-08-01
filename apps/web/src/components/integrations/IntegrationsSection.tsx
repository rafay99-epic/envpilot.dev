"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  Settings2,
  Trash2,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalBadge,
  TerminalButton,
  TerminalInput,
  TerminalSelect,
} from "@/components/dashboard/terminal-ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { useOrganizationProjects } from "@/hooks/useProjects";
import { sanitizeConvexError } from "@/lib/error-messages";

type Provider = "slack" | "discord";
type EventGroup = "variables" | "requests" | "members" | "security";

const EVENT_GROUPS: { key: EventGroup; label: string; hint: string }[] = [
  { key: "variables", label: "Variables", hint: "Created, updated, deleted" },
  { key: "requests", label: "Requests", hint: "Filed, approved, rejected" },
  { key: "members", label: "Members", hint: "Invites, removals, permissions" },
  { key: "security", label: "Security", hint: "Denials and token changes" },
];
const DEFAULT_GROUPS: EventGroup[] = ["variables", "requests"];

type WebhookRow = {
  _id: Id<"orgWebhooks">;
  name: string;
  type: Provider;
  source: "oauth" | "manual";
  channel: string | null;
  projectIds: Id<"projects">[] | null;
  urlPreview: string;
  eventGroups: EventGroup[];
  enabled: boolean;
  failCount: number;
  lastStatus: number | null;
  lastSentAt: number | null;
  createdAt: number;
};

type ProjectOption = {
  _id: Id<"projects">;
  name: string;
};

type ProviderState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; slack: boolean; discord: boolean };

function providerName(provider: Provider): string {
  return provider === "slack" ? "Slack" : "Discord";
}

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ProviderMark({ provider }: { provider: Provider }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${
        provider === "slack" ? "bg-emerald-600" : "bg-indigo-500"
      }`}
    >
      {provider === "slack" ? "S" : "D"}
    </span>
  );
}

function ProviderLoadingRows() {
  return (
    <div className="divide-y divide-zinc-800 border-y border-zinc-800">
      {["slack", "discord"].map((provider) => (
        <div key={provider} className="flex items-center gap-3 py-4">
          <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-56 animate-pulse rounded bg-zinc-800/70" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

function DestinationLoadingRows() {
  return (
    <div className="divide-y divide-zinc-800 border-y border-zinc-800">
      {[1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3 py-4">
          <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-800" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 animate-pulse rounded bg-zinc-800" />
            <div className="h-3 w-64 animate-pulse rounded bg-zinc-800/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function projectScopeLabel(
  projectIds: Id<"projects">[] | null,
  projects: ProjectOption[] | undefined
): string {
  if (projectIds === null) return "All projects";
  const names = projectIds.map(
    (projectId) =>
      projects?.find((project) => project._id === projectId)?.name ??
      "Unavailable project"
  );
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function IntegrationsSection({
  organizationId,
}: {
  organizationId: Id<"organizations">;
}) {
  const webhooks = useQuery(
    api.features.integrations.webhooks.listForOrganization,
    { organizationId }
  );
  const projects = useOrganizationProjects(organizationId) as
    | ProjectOption[]
    | undefined;
  const createHook = useAction(api.features.integrations.webhooks.create);
  const updateHook = useMutation(api.features.integrations.webhooks.update);
  const removeHook = useMutation(api.features.integrations.webhooks.remove);
  const sendTest = useMutation(api.features.integrations.webhooks.sendTest);
  const featureGate = useFeatureGate(organizationId, "team_notifications");
  const deliveryBlockedByPlan = !featureGate.isLoading && !featureGate.allowed;

  const [providerState, setProviderState] = useState<ProviderState>({
    status: "loading",
  });
  const [connectingProvider, setConnectingProvider] = useState<Provider | null>(
    null
  );

  const loadProviders = useCallback(async () => {
    setProviderState({ status: "loading" });
    try {
      const response = await fetch("/api/integrations/providers", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Provider lookup failed");
      const data = (await response.json()) as {
        slack?: unknown;
        discord?: unknown;
      };
      setProviderState({
        status: "ready",
        slack: data.slack === true,
        discord: data.discord === true,
      });
    } catch {
      setProviderState({ status: "error" });
      toast.error("Connection options could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("integration_error");
    if (connected === "slack" || connected === "discord") {
      toast.success(
        `${providerName(connected)} connected. A test message is on its way.`
      );
    } else if (oauthError) {
      toast.error(oauthError);
    }
    if (connected || oauthError) {
      const cleaned = new URLSearchParams(searchParams.toString());
      cleaned.delete("connected");
      cleaned.delete("integration_error");
      const query = cleaned.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  }, [pathname, router, searchParams]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualType, setManualType] = useState<Provider>("slack");
  const [manualUrl, setManualUrl] = useState("");
  const [manualAllProjects, setManualAllProjects] = useState(true);
  const [manualProjectIds, setManualProjectIds] = useState<Id<"projects">[]>(
    []
  );
  const [manualError, setManualError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<Id<"orgWebhooks"> | null>(null);
  const [editGroups, setEditGroups] = useState<EventGroup[]>([]);
  const [editAllProjects, setEditAllProjects] = useState(true);
  const [editProjectIds, setEditProjectIds] = useState<Id<"projects">[]>([]);
  const [savingId, setSavingId] = useState<Id<"orgWebhooks"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"orgWebhooks"> | null>(null);
  const [removingId, setRemovingId] = useState<Id<"orgWebhooks"> | null>(null);
  const [testingId, setTestingId] = useState<Id<"orgWebhooks"> | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"orgWebhooks"> | null>(null);

  const toggleGroup = (groups: EventGroup[], key: EventGroup): EventGroup[] =>
    groups.includes(key)
      ? groups.filter((group) => group !== key)
      : [...groups, key];

  const toggleProject = (
    projectsInScope: Id<"projects">[],
    projectId: Id<"projects">
  ): Id<"projects">[] =>
    projectsInScope.includes(projectId)
      ? projectsInScope.filter((id) => id !== projectId)
      : [...projectsInScope, projectId];

  const startConnect = async (provider: Provider) => {
    setConnectingProvider(provider);
    try {
      const response = await fetch(
        `/api/integrations/${provider}/start?organizationId=${encodeURIComponent(organizationId)}&format=json`,
        { cache: "no-store" }
      );
      const data = (await response.json().catch(() => null)) as {
        url?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok || typeof data?.url !== "string") {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Could not connect ${providerName(provider)}.`
        );
      }
      window.location.assign(data.url);
    } catch (error) {
      toast.error(sanitizeConvexError(error));
      setConnectingProvider(null);
    }
  };

  const handleManualCreate = async () => {
    if (!manualUrl.trim()) {
      setManualError("Enter the webhook URL supplied by the provider.");
      return;
    }
    if (!manualAllProjects && manualProjectIds.length === 0) {
      setManualError("Select at least one project or choose all projects.");
      return;
    }
    setIsCreating(true);
    setManualError(null);
    try {
      await createHook({
        organizationId,
        name: `${providerName(manualType)} notifications`,
        type: manualType,
        source: "manual",
        url: manualUrl.trim(),
        projectIds: manualAllProjects ? undefined : manualProjectIds,
        eventGroups: DEFAULT_GROUPS,
      });
      setShowAdvanced(false);
      setManualUrl("");
      setManualAllProjects(true);
      setManualProjectIds([]);
      toast.success("Destination added. A test message is on its way.");
    } catch (error) {
      setManualError(sanitizeConvexError(error));
    } finally {
      setIsCreating(false);
    }
  };

  const openEditor = (hook: WebhookRow) => {
    if (editingId === hook._id) {
      setEditingId(null);
      return;
    }
    const availableProjectIds = projects
      ? new Set(projects.map((project) => project._id))
      : null;
    const selectedProjectIds = availableProjectIds
      ? (hook.projectIds ?? []).filter((projectId) =>
          availableProjectIds.has(projectId)
        )
      : (hook.projectIds ?? []);
    if (
      hook.projectIds !== null &&
      selectedProjectIds.length !== hook.projectIds.length
    ) {
      toast.info("Unavailable projects were removed from this destination.");
    }
    setEditingId(hook._id);
    setEditGroups(hook.eventGroups);
    setEditAllProjects(hook.projectIds === null);
    setEditProjectIds(selectedProjectIds);
  };

  const handleSave = async (webhookId: Id<"orgWebhooks">) => {
    if (editGroups.length === 0) {
      toast.error("Select at least one event group.");
      return;
    }
    const availableProjectIds = projects
      ? new Set(projects.map((project) => project._id))
      : null;
    const selectedProjectIds = availableProjectIds
      ? editProjectIds.filter((projectId) => availableProjectIds.has(projectId))
      : editProjectIds;
    if (selectedProjectIds.length !== editProjectIds.length) {
      setEditProjectIds(selectedProjectIds);
      toast.info("Unavailable projects were removed from this destination.");
    }
    if (!editAllProjects && selectedProjectIds.length === 0) {
      toast.error("Select at least one project or choose all projects.");
      return;
    }
    setSavingId(webhookId);
    try {
      await updateHook({
        webhookId,
        eventGroups: editGroups,
        projectIds: editAllProjects ? null : selectedProjectIds,
      });
      setEditingId(null);
      toast.success("Notification routing updated.");
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleEnabled = async (hook: WebhookRow) => {
    setTogglingId(hook._id);
    try {
      await updateHook({ webhookId: hook._id, enabled: !hook.enabled });
      toast.success(
        hook.enabled ? "Destination paused." : "Destination resumed."
      );
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    } finally {
      setTogglingId(null);
    }
  };

  const handleRemove = async (webhookId: Id<"orgWebhooks">) => {
    setRemovingId(webhookId);
    try {
      await removeHook({ webhookId });
      setDeletingId(null);
      toast.success("Destination disconnected.");
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    } finally {
      setRemovingId(null);
    }
  };

  const handleSendTest = async (webhookId: Id<"orgWebhooks">) => {
    setTestingId(webhookId);
    try {
      await sendTest({ webhookId });
      toast.success("Test message queued.");
    } catch (error) {
      toast.error(sanitizeConvexError(error));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-10">
      <section aria-labelledby="connect-notifications-heading">
        <div className="mb-5">
          <h2
            id="connect-notifications-heading"
            className="text-base font-semibold text-zinc-100"
          >
            Connect a channel
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Choose a provider, select a channel there, and return here. Secret
            values are never included in notifications.
          </p>
        </div>

        <FeatureGate
          organizationId={organizationId}
          featureKey="team_notifications"
          featureName="Slack & Discord Notifications"
          fallbackVariant="card"
        >
          {providerState.status === "loading" ? (
            <ProviderLoadingRows />
          ) : providerState.status === "error" ? (
            <div className="flex items-center justify-between gap-4 border-y border-zinc-800 py-4">
              <p className="text-sm text-zinc-400">
                Connection options are temporarily unavailable.
              </p>
              <TerminalButton variant="secondary" onClick={loadProviders}>
                Retry
              </TerminalButton>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800 border-y border-zinc-800">
              {(["slack", "discord"] as const).map((provider) => {
                const available = providerState[provider];
                const connecting = connectingProvider === provider;
                return (
                  <div
                    key={provider}
                    className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center"
                  >
                    <ProviderMark provider={provider} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100">
                        {providerName(provider)}
                      </p>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {available
                          ? `Choose a ${providerName(provider)} channel to receive updates.`
                          : "Connection is unavailable on this deployment."}
                      </p>
                    </div>
                    <TerminalButton
                      onClick={() => startConnect(provider)}
                      disabled={!available || connecting}
                      className="justify-center sm:min-w-36"
                    >
                      {connecting && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {available
                        ? connecting
                          ? "Connecting..."
                          : `Connect ${providerName(provider)}`
                        : "Unavailable"}
                    </TerminalButton>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setShowAdvanced((visible) => !visible);
                setManualError(null);
              }}
              data-testid="add-webhook-manually"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Advanced setup
            </button>
          </div>

          {showAdvanced && (
            <div
              data-testid="manual-webhook-form"
              className="mt-4 border-t border-zinc-800 pt-5"
            >
              <p className="mb-5 text-sm text-zinc-500">
                Use a provider webhook URL only when OAuth installation is not
                available. Most teams should use the connect buttons above.
              </p>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <label className="space-y-1.5 text-sm font-medium text-zinc-300">
                  Provider
                  <TerminalSelect
                    value={manualType}
                    onChange={(event) => {
                      setManualType(event.target.value as Provider);
                      setManualError(null);
                    }}
                    className="w-full"
                  >
                    <option value="slack">Slack</option>
                    <option value="discord">Discord</option>
                  </TerminalSelect>
                </label>
                <label className="space-y-1.5 text-sm font-medium text-zinc-300">
                  Webhook URL
                  <TerminalInput
                    type="url"
                    value={manualUrl}
                    onChange={(event) => {
                      setManualUrl(event.target.value);
                      setManualError(null);
                    }}
                    placeholder={
                      manualType === "slack"
                        ? "https://hooks.slack.com/services/..."
                        : "https://discord.com/api/webhooks/..."
                    }
                    aria-invalid={
                      manualError !== null &&
                      !manualError.toLowerCase().includes("project")
                    }
                  />
                </label>
              </div>

              <div className="mt-5">
                <label className="text-sm font-medium text-zinc-300">
                  Project routing
                </label>
                <TerminalSelect
                  value={manualAllProjects ? "all" : "selected"}
                  onChange={(event) => {
                    setManualAllProjects(event.target.value === "all");
                    setManualError(null);
                  }}
                  className="mt-1.5 w-full"
                >
                  <option value="all">All projects</option>
                  <option value="selected">Selected projects</option>
                </TerminalSelect>
                {!manualAllProjects && (
                  <ProjectChecklist
                    projects={projects}
                    selected={manualProjectIds}
                    onToggle={(projectId) => {
                      setManualProjectIds((current) =>
                        toggleProject(current, projectId)
                      );
                      setManualError(null);
                    }}
                  />
                )}
              </div>

              {manualError && (
                <p className="mt-3 text-sm text-red-400" role="alert">
                  {manualError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <TerminalButton
                  variant="secondary"
                  onClick={() => setShowAdvanced(false)}
                >
                  Cancel
                </TerminalButton>
                <TerminalButton
                  onClick={handleManualCreate}
                  disabled={isCreating || !manualUrl.trim()}
                >
                  {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isCreating ? "Adding..." : "Add destination"}
                </TerminalButton>
              </div>
            </div>
          )}
        </FeatureGate>
      </section>

      <section aria-labelledby="connected-destinations-heading">
        <div className="mb-5">
          <h2
            id="connected-destinations-heading"
            className="text-base font-semibold text-zinc-100"
          >
            Connected destinations
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Route all organization activity or selected projects to each
            channel. Connect the same provider again for another channel.
          </p>
        </div>

        {webhooks === undefined ? (
          <DestinationLoadingRows />
        ) : webhooks.length === 0 ? (
          <div className="border-y border-dashed border-zinc-800 py-8 text-center">
            <p className="text-sm text-zinc-400">No channels connected yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Slack or Discord will ask you which channel to use.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800 border-y border-zinc-800">
            {(webhooks as WebhookRow[]).map((hook) => {
              const editing = editingId === hook._id;
              const deleting = deletingId === hook._id;
              const unhealthy = hook.failCount > 0;
              return (
                <div
                  key={hook._id}
                  className="py-4"
                  data-testid="webhook-row"
                  data-last-sent-at={hook.lastSentAt ?? ""}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <ProviderMark provider={hook.type} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {hook.channel ?? hook.name}
                        </p>
                        <TerminalBadge
                          color={hook.type === "slack" ? "green" : "blue"}
                        >
                          {providerName(hook.type)}
                        </TerminalBadge>
                        <span
                          className={`text-xs ${
                            deliveryBlockedByPlan
                              ? "text-zinc-500"
                              : !hook.enabled
                                ? "text-zinc-500"
                                : unhealthy
                                  ? "text-amber-400"
                                  : "text-green-400"
                          }`}
                        >
                          {deliveryBlockedByPlan
                            ? "Plan disabled"
                            : !hook.enabled
                              ? "Paused"
                              : unhealthy
                                ? "Needs attention"
                                : "Active"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {hook.source === "manual" && `${hook.urlPreview} · `}
                        {projectScopeLabel(hook.projectIds, projects)} ·{" "}
                        {hook.eventGroups.join(", ")}
                        {hook.lastSentAt
                          ? ` · sent ${relativeTime(hook.lastSentAt)}`
                          : ""}
                      </p>
                      {hook.lastStatus !== null &&
                        (hook.lastStatus < 200 || hook.lastStatus >= 300) && (
                          <p className="mt-1 text-xs text-amber-400">
                            {hook.lastStatus === 429
                              ? "Slack or Discord is rate-limiting delivery; retry is automatic."
                              : "The last delivery failed; retry is automatic."}
                          </p>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditor(hook)}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(hook)}
                        disabled={
                          togglingId === hook._id ||
                          (!hook.enabled && deliveryBlockedByPlan)
                        }
                        className="rounded-md px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
                      >
                        {togglingId === hook._id
                          ? "Saving..."
                          : hook.enabled
                            ? "Pause"
                            : "Resume"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendTest(hook._id)}
                        disabled={
                          testingId === hook._id ||
                          !hook.enabled ||
                          deliveryBlockedByPlan
                        }
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-green-400 disabled:opacity-40"
                        title="Send test message"
                      >
                        {testingId === hook._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(hook._id)}
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
                        title="Disconnect destination"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {editing && (
                    <div className="mt-4 border-t border-zinc-800 pt-4">
                      <div className="grid gap-6 md:grid-cols-2">
                        <fieldset>
                          <legend className="text-sm font-medium text-zinc-300">
                            Events
                          </legend>
                          <div className="mt-3 space-y-2.5">
                            {EVENT_GROUPS.map((group) => (
                              <label
                                key={group.key}
                                className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-300"
                              >
                                <input
                                  type="checkbox"
                                  checked={editGroups.includes(group.key)}
                                  onChange={() =>
                                    setEditGroups((current) =>
                                      toggleGroup(current, group.key)
                                    )
                                  }
                                  className="mt-0.5 accent-green-500"
                                />
                                <span>
                                  {group.label}
                                  <span className="block text-xs text-zinc-600">
                                    {group.hint}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <fieldset>
                          <legend className="text-sm font-medium text-zinc-300">
                            Projects
                          </legend>
                          <TerminalSelect
                            value={editAllProjects ? "all" : "selected"}
                            onChange={(event) =>
                              setEditAllProjects(event.target.value === "all")
                            }
                            className="mt-3 w-full"
                          >
                            <option value="all">All projects</option>
                            <option value="selected">Selected projects</option>
                          </TerminalSelect>
                          {!editAllProjects && (
                            <ProjectChecklist
                              projects={projects}
                              selected={editProjectIds}
                              onToggle={(projectId) =>
                                setEditProjectIds((current) =>
                                  toggleProject(current, projectId)
                                )
                              }
                            />
                          )}
                        </fieldset>
                      </div>
                      <div className="mt-5 flex justify-end gap-2">
                        <TerminalButton
                          variant="secondary"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </TerminalButton>
                        <TerminalButton
                          onClick={() => handleSave(hook._id)}
                          disabled={savingId === hook._id}
                        >
                          {savingId === hook._id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {savingId === hook._id ? "Saving..." : "Save routing"}
                        </TerminalButton>
                      </div>
                    </div>
                  )}

                  {deleting && (
                    <div
                      role="dialog"
                      aria-label={`Disconnect ${hook.channel ?? hook.name}`}
                      className="mt-4 flex flex-col gap-3 border-t border-red-500/20 pt-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-sm text-red-300">
                        Disconnect this destination? New notifications stop
                        immediately.
                      </p>
                      <div className="flex gap-2">
                        <TerminalButton
                          variant="secondary"
                          onClick={() => setDeletingId(null)}
                        >
                          Cancel
                        </TerminalButton>
                        <TerminalButton
                          variant="danger"
                          onClick={() => handleRemove(hook._id)}
                          disabled={removingId === hook._id}
                        >
                          {removingId === hook._id && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {removingId === hook._id
                            ? "Disconnecting..."
                            : "Disconnect"}
                        </TerminalButton>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectChecklist({
  projects,
  selected,
  onToggle,
}: {
  projects: ProjectOption[] | undefined;
  selected: Id<"projects">[];
  onToggle: (projectId: Id<"projects">) => void;
}) {
  if (projects === undefined) {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading projects...
      </p>
    );
  }
  if (projects.length === 0) {
    return <p className="mt-3 text-xs text-zinc-500">No active projects.</p>;
  }
  return (
    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-2">
      {projects.map((project) => (
        <label
          key={project._id}
          className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
        >
          <input
            type="checkbox"
            checked={selected.includes(project._id)}
            onChange={() => onToggle(project._id)}
            className="accent-green-500"
          />
          <span className="truncate">{project.name}</span>
          {selected.includes(project._id) && (
            <Check className="ml-auto h-3.5 w-3.5 text-green-400" />
          )}
        </label>
      ))}
    </div>
  );
}
