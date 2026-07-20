"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Copy,
  Check,
  ChevronDown,
  Terminal as TerminalIcon,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import * as Sentry from "@sentry/nextjs";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { DrawerPanel } from "@/components/ui";
import {
  TerminalCard,
  TerminalButton,
  TerminalInput,
  TerminalBadge,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { TerminalDatePicker } from "@/components/dashboard/terminal-date-picker";
import { useOrganizationProjects } from "@/hooks";
import { ENVIRONMENTS, type Environment } from "@/constants/project";

/**
 * Capture UNEXPECTED key-management failures. Expected validation/authz
 * rejections (tier gate, role, scope, key cap, expiry) are user-facing
 * states the UI already renders — alerting on them would bury real breakage.
 */
function reportApiKeysUiError(error: unknown, action: "create" | "revoke") {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /pro plan|not authorized|only the organization|at most|at least one (environment|project|resource|surface)|must be 1-100|expiresAt must be in the future|project not found|unknown "(environment|resource)"|github action key/i.test(
      message
    )
  ) {
    return;
  }
  Sentry.captureException(error, {
    tags: { source: "api-keys-ui", action },
  });
}

const ENV_CHIP_SELECTED: Record<Environment, string> = {
  development: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  staging: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  production: "border-green-500/40 bg-green-500/10 text-green-400",
};

const RESOURCES = ["variables", "accounts", "projects", "requests"] as const;
type Resource = (typeof RESOURCES)[number];

// "requests" is the one mutating capability: the key may FILE variable
// requests (a human approves them). Not compatible with the GitHub Action
// surface — CI can't wait on human approval.
const RESOURCE_HINT: Partial<Record<Resource, string>> = {
  requests: "may file variable requests for human approval (agents)",
};

// Which MCP tools each resource unlocks — mirrors the `requirement` each
// Convex action enforces (convex/features/api/reads.ts / requests.ts).
// Shown in the create form when the MCP surface is selected so keys aren't
// minted with scopes that make every MCP call fail.
const MCP_RESOURCE_TOOLS: Record<Resource, string> = {
  projects:
    "envpilot_list_projects, envpilot_search (key matches also need variables)",
  variables: "envpilot_get_variables, envpilot_get_variable",
  accounts: "envpilot_list_accounts",
  requests: "envpilot_request_variable, envpilot_get_request_status",
};

const SURFACES = ["rest_api", "mcp_server", "github_action"] as const;
type Surface = (typeof SURFACES)[number];

const SURFACE_LABEL: Record<Surface, string> = {
  rest_api: "REST API",
  mcp_server: "MCP server",
  github_action: "GitHub Action",
};

const CHIP_BASE =
  "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors";
const CHIP_UNSELECTED =
  "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300";
const CHIP_SELECTED_GENERIC =
  "border-green-500/40 bg-green-500/10 text-green-400";
const CHIP_SELECTED_PURPLE =
  "border-purple-500/40 bg-purple-500/10 text-purple-400";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const EXPIRY_URGENT_MS = 7 * 24 * 60 * 60 * 1000;

interface ApiKeysSectionProps {
  organizationId: Id<"organizations"> | undefined;
  /** Only owners may mint org-wide ("all projects") keys — the create panel
   * hides that radio option for everyone else. The server enforces the same
   * rule independently; this is purely UX. */
  isOwner: boolean;
}

/**
 * "API Keys" organization settings section — org-scoped, multi-resource
 * keys for the public REST API, MCP server, and GitHub Action (the one
 * machine credential). Pro-gated via the `public_api`
 * registry feature (server enforces the same gate — this is UX, not the
 * security boundary).
 *
 * Everything here is inline — no modals, no confirm dialogs. Creation
 * expands a panel above the list; revocation swaps the row's button for an
 * in-place confirm strip.
 */
export function ApiKeysSection({
  organizationId,
  isOwner,
}: ApiKeysSectionProps) {
  return (
    <FeatureGate
      organizationId={organizationId}
      featureKey="public_api"
      featureName="Public REST API"
      fallbackVariant="card"
    >
      <ApiKeysSectionInner organizationId={organizationId} isOwner={isOwner} />
    </FeatureGate>
  );
}

function ApiKeysSectionInner({
  organizationId,
  isOwner,
}: {
  organizationId: Id<"organizations"> | undefined;
  isOwner: boolean;
}) {
  const keys = useQuery(
    api.features.api.keys.listForOrganization,
    organizationId ? { organizationId } : "skip"
  );
  const isLoading = organizationId ? keys === undefined : true;
  const keyList = keys ?? [];

  // Recent activity per key, derived from bounded audit-log reads (window
  // = the org's audit retention, labeled as such in the row). Live keys
  // only — revoked rows accumulate forever and their usage renders empty.
  const liveKeyIds = keyList
    .filter((k) => k.revokedAt === null)
    .map((k) => k._id);
  const usageResult = useQuery(
    api.features.api.keys.usageForOrganization,
    organizationId && liveKeyIds.length > 0
      ? { organizationId, keyIds: liveKeyIds }
      : "skip"
  );

  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <TerminalCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">API Keys</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Scoped keys for the public REST API, MCP server, and GitHub
              Action. Read-only — except keys with the requests resource, which
              may file variable requests for human approval.
            </p>
          </div>
          <TerminalButton
            type="button"
            variant="primary"
            onClick={() => setShowCreate(true)}
          >
            New Key
          </TerminalButton>
        </div>

        {organizationId && (
          <CreateKeyDrawer
            organizationId={organizationId}
            isOwner={isOwner}
            isOpen={showCreate}
            onClose={() => setShowCreate(false)}
          />
        )}

        <div className="mt-6">
          {isLoading ? (
            <TerminalLoading />
          ) : keyList.length === 0 ? (
            !showCreate && (
              <TerminalEmptyState
                command='curl -H "Authorization: Bearer $ENVPILOT_API_KEY" https://www.envpilot.dev/api/v1/projects'
                message="No API keys yet. Create one to call the public REST API or connect the MCP server."
                action={{
                  label: "New Key",
                  onClick: () => setShowCreate(true),
                }}
              />
            )
          ) : (
            <ul
              data-testid="api-keys-list"
              className="divide-y divide-zinc-800"
            >
              {keyList.map((key) => (
                <KeyRow
                  key={key._id}
                  keyItem={key}
                  usage={usageResult?.usage[key._id as string] ?? null}
                />
              ))}
            </ul>
          )}
        </div>
      </TerminalCard>
    </div>
  );
}

interface ApiKeyListItem {
  _id: Id<"apiKeys">;
  name: string;
  scopeProjects: "all" | Id<"projects">[];
  scopeEnvironments: "all" | string[];
  scopeResources: string[];
  surfaces: Surface[] | null;
  createdAt: number;
  createdByName: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  expiresAt: number | null;
}

interface KeyUsage {
  pulls: number;
  denials: number;
  requestsFiled: number;
}

function KeyRow({
  keyItem,
  usage,
}: {
  keyItem: ApiKeyListItem;
  usage: KeyUsage | null;
}) {
  const revoke = useMutation(api.features.api.keys.revoke);
  const isRevoked = keyItem.revokedAt !== null;

  const [confirming, setConfirming] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const recentlyUsed =
    keyItem.lastUsedAt !== null &&
    Date.now() - keyItem.lastUsedAt < SEVEN_DAYS_MS;

  // Expiry countdown — computed inline (not a separate component) so the
  // impure Date.now() read stays inside this already-stateful row component.
  const expiryMsLeft =
    keyItem.expiresAt !== null ? keyItem.expiresAt - Date.now() : null;
  const expiryExpired = expiryMsLeft !== null && expiryMsLeft <= 0;
  const expiryUrgent =
    expiryMsLeft !== null && (expiryExpired || expiryMsLeft < EXPIRY_URGENT_MS);
  const expiryDaysLeft =
    expiryMsLeft !== null
      ? Math.ceil(expiryMsLeft / (24 * 60 * 60 * 1000))
      : null;

  const handleConfirmRevoke = async () => {
    setIsRevoking(true);
    setRowError(null);
    try {
      await revoke({ keyId: keyItem._id });
      setConfirming(false);
      toast.success(`API key "${keyItem.name}" revoked`);
    } catch (err) {
      reportApiKeysUiError(err, "revoke");
      const message =
        err instanceof Error ? err.message : "Failed to revoke key";
      setRowError(message);
      toast.error(message);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <li className={`py-4 ${isRevoked ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm font-medium text-zinc-100">
              {keyItem.name}
            </span>
            {isRevoked && <TerminalBadge color="red">Revoked</TerminalBadge>}
            {!isRevoked && expiryExpired && (
              <TerminalBadge color="red">Expired</TerminalBadge>
            )}
            {!isRevoked && !expiryExpired && expiryUrgent && (
              <TerminalBadge color="red">
                expires in {expiryDaysLeft}d
              </TerminalBadge>
            )}
          </div>
          {/* One quiet scope line instead of a badge per datum — status is
              the only thing that earns a colored pill. */}
          <p className="mt-1 font-mono text-xs text-zinc-400">
            {keyItem.scopeProjects === "all"
              ? "all projects"
              : `${keyItem.scopeProjects.length} project${
                  keyItem.scopeProjects.length === 1 ? "" : "s"
                }`}
            {" · "}
            {keyItem.scopeEnvironments === "all"
              ? "all environments"
              : keyItem.scopeEnvironments.join(", ")}
            {" · "}
            {keyItem.scopeResources.join(", ")}
            {" · "}
            {keyItem.surfaces === null
              ? "all surfaces"
              : keyItem.surfaces
                  .map((surface) => SURFACE_LABEL[surface])
                  .join(", ")}
            {!isRevoked &&
              expiryMsLeft !== null &&
              !expiryExpired &&
              !expiryUrgent &&
              ` · expires in ${expiryDaysLeft}d`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
            <span>
              Created by {keyItem.createdByName}{" "}
              {formatDistanceToNow(new Date(keyItem.createdAt), {
                addSuffix: true,
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  recentlyUsed ? "bg-green-400" : "bg-zinc-600"
                }`}
                aria-hidden="true"
              />
              {keyItem.lastUsedAt
                ? `last used ${formatDistanceToNow(
                    new Date(keyItem.lastUsedAt),
                    { addSuffix: true }
                  )}`
                : "never used"}
            </span>
            {usage &&
              (usage.pulls > 0 ||
                usage.denials > 0 ||
                usage.requestsFiled > 0) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    recent: {usage.pulls} pull{usage.pulls === 1 ? "" : "s"}
                    {usage.denials > 0 && `, ${usage.denials} denied`}
                    {usage.requestsFiled > 0 &&
                      `, ${usage.requestsFiled} request${
                        usage.requestsFiled === 1 ? "" : "s"
                      } filed`}
                  </span>
                </>
              )}
          </p>
        </div>

        {/* The action slot holds ONLY the compact Revoke button — the
            confirm strip renders full-width BELOW the row so it never
            competes with (and crushes) the name/metadata column. */}
        {!isRevoked && !confirming && (
          <TerminalButton
            type="button"
            variant="danger"
            onClick={() => setConfirming(true)}
          >
            Revoke
          </TerminalButton>
        )}
      </div>

      {!isRevoked && (
        <AnimatePresence initial={false}>
          {confirming && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-red-400">
                    Revoke this key? Anything using it will stop working
                    immediately.
                  </p>
                  {rowError && (
                    <p className="mt-1 text-xs font-medium text-red-400">
                      {rowError}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TerminalButton
                    type="button"
                    variant="danger"
                    onClick={handleConfirmRevoke}
                    disabled={isRevoking}
                  >
                    {isRevoking ? "Revoking..." : "Revoke"}
                  </TerminalButton>
                  <TerminalButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setConfirming(false);
                      setRowError(null);
                    }}
                    disabled={isRevoking}
                  >
                    Cancel
                  </TerminalButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </li>
  );
}

// ============================================================
// Inline create panel (form → one-time reveal, no dialog)
// ============================================================

type ProjectScopeMode = "all" | "specific";
type EnvScopeMode = "all" | "specific";
type ExpiryMode = "none" | "30d" | "90d" | "custom";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function CreateKeyDrawer({
  organizationId,
  isOwner,
  isOpen,
  onClose,
}: {
  organizationId: Id<"organizations">;
  isOwner: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
  const createKey = useAction(api.features.api.keys.create);
  const projects = useOrganizationProjects(organizationId);
  const projectsLoading = projects === undefined;

  const [name, setName] = useState("");
  const [projectMode, setProjectMode] = useState<ProjectScopeMode>("specific");
  const [selectedProjectIds, setSelectedProjectIds] = useState<
    Set<Id<"projects">>
  >(new Set());
  const [envMode, setEnvMode] = useState<EnvScopeMode>("specific");
  const [selectedEnvs, setSelectedEnvs] = useState<Set<Environment>>(
    new Set<Environment>(["production"])
  );
  // projects is in the default set because the default surfaces include the
  // MCP server, whose clients start every session by listing projects — a
  // variables-only key makes every MCP call fail with a scope denial.
  const [selectedResources, setSelectedResources] = useState<Set<Resource>>(
    new Set<Resource>(["variables", "projects"])
  );
  const [selectedSurfaces, setSelectedSurfaces] = useState<Set<Surface>>(
    new Set<Surface>(["rest_api", "mcp_server"])
  );
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("none");
  const [customExpiry, setCustomExpiry] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);

  // Fresh form every open — the drawer only unmounts its children, so the
  // previous run's state (including a revealed key) must not linger.
  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setProjectMode("specific");
    setSelectedProjectIds(new Set());
    setEnvMode("specific");
    setSelectedEnvs(new Set<Environment>(["production"]));
    setSelectedResources(new Set<Resource>(["variables", "projects"]));
    setSelectedSurfaces(new Set<Surface>(["rest_api", "mcp_server"]));
    setExpiryMode("none");
    setCustomExpiry("");
    setIsSubmitting(false);
    setError(null);
    setCreatedToken(null);
    setCopied(false);
    setShowSnippet(false);
  }, [isOpen]);

  const toggleProject = (id: Id<"projects">) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleEnv = (env: Environment) => {
    setEnvMode("specific");
    setSelectedEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(env)) {
        next.delete(env);
      } else {
        next.add(env);
      }
      return next;
    });
  };

  const toggleResource = (resource: Resource) => {
    setSelectedResources((prev) => {
      const next = new Set(prev);
      if (next.has(resource)) {
        next.delete(resource);
      } else {
        next.add(resource);
      }
      return next;
    });
  };

  const toggleSurface = (surface: Surface) => {
    const adding = !selectedSurfaces.has(surface);
    setSelectedSurfaces((prev) => {
      const next = new Set(prev);
      if (next.has(surface)) {
        next.delete(surface);
      } else {
        next.add(surface);
      }
      return next;
    });
    // The Action pull path only accepts single-project, exactly-variables
    // keys (and never files requests) — steer the form into that shape
    // instead of failing at submit.
    if (adding && surface === "github_action") {
      setProjectMode("specific");
      setSelectedResources(new Set<Resource>(["variables"]));
    }
  };

  const githubActionSelected = selectedSurfaces.has("github_action");
  const mcpSelected = selectedSurfaces.has("mcp_server");

  const projectSelectionValid = githubActionSelected
    ? projectMode === "specific" && selectedProjectIds.size === 1
    : projectMode === "all" || selectedProjectIds.size > 0;
  const envSelectionValid = envMode === "all" || selectedEnvs.size > 0;
  const resourceSelectionValid =
    selectedResources.size > 0 &&
    (!githubActionSelected ||
      (selectedResources.size === 1 && selectedResources.has("variables")));
  const surfaceSelectionValid = selectedSurfaces.size > 0;
  const customExpiryValid =
    expiryMode !== "custom" ||
    (customExpiry.length > 0 && new Date(customExpiry).getTime() > Date.now());

  const canSubmit =
    name.trim().length > 0 &&
    projectSelectionValid &&
    envSelectionValid &&
    resourceSelectionValid &&
    surfaceSelectionValid &&
    customExpiryValid &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const scopeProjects: "all" | Id<"projects">[] =
        projectMode === "all" ? "all" : Array.from(selectedProjectIds);
      const scopeEnvironments: "all" | string[] =
        envMode === "all" ? "all" : Array.from(selectedEnvs);
      const scopeResources = Array.from(selectedResources);

      let expiresAt: number | undefined;
      if (expiryMode === "30d") expiresAt = Date.now() + THIRTY_DAYS_MS;
      else if (expiryMode === "90d") expiresAt = Date.now() + NINETY_DAYS_MS;
      else if (expiryMode === "custom")
        expiresAt = new Date(customExpiry).getTime();

      const trimmedName = name.trim();
      const result = await createKey({
        organizationId,
        name: trimmedName,
        scopeProjects,
        scopeEnvironments,
        scopeResources,
        surfaces: Array.from(selectedSurfaces),
        expiresAt,
      });
      // Held only in this panel's local state — never persisted, never
      // logged, cleared when the panel collapses (unmount on "Done").
      setCreatedToken(result.token);
      toast.success(`API key "${trimmedName}" created`);
    } catch (err) {
      reportApiKeysUiError(err, "create");
      const message =
        err instanceof Error ? err.message : "Failed to create key";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op fallback
    }
  };

  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="New API Key"
      width="lg"
      // While creating, and once the one-time plaintext is on screen, only
      // the explicit Done button may close — a stray backdrop click must
      // never eat the only copy of the key.
      preventClose={isSubmitting || createdToken !== null}
    >
      {createdToken ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-semibold text-green-400">
              Key created
            </h3>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-900/10 px-3 py-2">
            <span className="text-sm text-amber-400">
              <span className="font-semibold">
                Copy it now — you won&apos;t see this key again.
              </span>{" "}
              Envpilot only stores its hash.
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              API Key
            </label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200">
                {createdToken}
              </code>
              <TerminalButton
                type="button"
                onClick={handleCopy}
                className="shrink-0"
                aria-label="Copy key"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </TerminalButton>
            </div>
          </div>

          {mcpSelected && (
            <p
              data-testid="api-key-mcp-rotation-hint"
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400"
            >
              Replacing a key in an existing MCP setup? Swap this key into your
              client&apos;s Authorization header (or the exported{" "}
              <code className="rounded bg-zinc-800 px-1 py-0.5">
                ENVPILOT_API_KEY
              </code>
              ), confirm a tool call works, then revoke the old key below.
              Claude Code refuses to re-add an existing server — run{" "}
              <code className="rounded bg-zinc-800 px-1 py-0.5">
                claude mcp remove envpilot
              </code>{" "}
              first.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowSnippet((prev) => !prev)}
              aria-expanded={showSnippet}
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
            >
              <TerminalIcon className="h-3.5 w-3.5" />
              curl usage
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showSnippet ? "rotate-180" : ""
                }`}
              />
            </button>
            <AnimatePresence initial={false}>
              {showSnippet && (
                <motion.div
                  key="snippet"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-300">
                    {`curl -H "Authorization: Bearer $ENVPILOT_API_KEY" \\
  "https://www.envpilot.dev/api/v1/projects/{slug}/variables?environment=production"`}
                  </pre>
                  <p className="mt-1 text-xs text-zinc-500">
                    Store the key as the{" "}
                    <code className="rounded bg-zinc-800 px-1 py-0.5">
                      ENVPILOT_API_KEY
                    </code>{" "}
                    environment variable, and replace{" "}
                    <code className="rounded bg-zinc-800 px-1 py-0.5">
                      {"{slug}"}
                    </code>{" "}
                    with your project&apos;s slug.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex justify-end">
            <TerminalButton type="button" onClick={onClose}>
              Done
            </TerminalButton>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="api-key-name"
              className="block text-sm font-medium text-zinc-300"
            >
              Name
            </label>
            <TerminalInput
              id="api-key-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. deploy-pipeline"
              required
              maxLength={100}
              className="mt-1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Surfaces
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SURFACES.map((surface) => {
                const selected = selectedSurfaces.has(surface);
                return (
                  <button
                    key={surface}
                    type="button"
                    data-testid={`api-key-surface-${surface}`}
                    aria-pressed={selected}
                    onClick={() => toggleSurface(surface)}
                    className={`${CHIP_BASE} normal-case ${
                      selected ? CHIP_SELECTED_GENERIC : CHIP_UNSELECTED
                    }`}
                  >
                    {SURFACE_LABEL[surface]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {githubActionSelected
                ? "A GitHub Action key is locked to exactly one project and the variables resource — the Action's pull endpoint takes no project parameter."
                : "Where this key may be used. The GitHub Action pulls variables for a single project."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Projects
            </label>
            <div className="mt-2 flex gap-1 rounded-lg bg-zinc-800 p-1">
              {isOwner && !githubActionSelected && (
                <button
                  type="button"
                  aria-pressed={projectMode === "all"}
                  onClick={() => setProjectMode("all")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    projectMode === "all"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-300"
                  }`}
                >
                  All projects (includes future ones)
                </button>
              )}
              <button
                type="button"
                aria-pressed={projectMode === "specific"}
                onClick={() => setProjectMode("specific")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  projectMode === "specific"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-300"
                }`}
              >
                Specific projects
              </button>
            </div>

            {projectMode === "specific" && (
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                {projectsLoading ? (
                  <p className="px-2 py-1.5 text-xs text-zinc-500">
                    Loading projects...
                  </p>
                ) : projects.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-zinc-500">
                    No projects yet.
                  </p>
                ) : (
                  projects.map((project) => (
                    <label
                      key={project._id}
                      data-testid={`api-key-project-${project.slug}`}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800/60"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.has(project._id)}
                        onChange={() => toggleProject(project._id)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-green-500 focus:ring-1 focus:ring-green-500/30"
                      />
                      {project.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Environments
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={envMode === "all"}
                onClick={() => setEnvMode("all")}
                className={`${CHIP_BASE} ${
                  envMode === "all" ? CHIP_SELECTED_PURPLE : CHIP_UNSELECTED
                }`}
              >
                All
              </button>
              {ENVIRONMENTS.map((env) => {
                const selected =
                  envMode === "specific" && selectedEnvs.has(env);
                return (
                  <button
                    key={env}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleEnv(env)}
                    className={`${CHIP_BASE} ${
                      selected ? ENV_CHIP_SELECTED[env] : CHIP_UNSELECTED
                    }`}
                  >
                    {env}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Recommended: scope keys to a single environment.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Resources
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {RESOURCES.map((resource) => {
                const selected = selectedResources.has(resource);
                const disabled =
                  githubActionSelected && resource !== "variables";
                return (
                  <button
                    key={resource}
                    type="button"
                    data-testid={`api-key-resource-${resource}`}
                    aria-pressed={selected}
                    disabled={disabled}
                    title={
                      disabled
                        ? "GitHub Action keys carry exactly the variables resource"
                        : RESOURCE_HINT[resource]
                    }
                    onClick={() => toggleResource(resource)}
                    className={`${CHIP_BASE} ${
                      selected ? CHIP_SELECTED_GENERIC : CHIP_UNSELECTED
                    } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    {resource}
                  </button>
                );
              })}
            </div>
            {selectedResources.has("requests") && (
              <p className="mt-2 text-xs text-zinc-500">
                This key may file variable requests over MCP — a human approves
                them in the dashboard and supplies the value. Keys never write
                secrets.
              </p>
            )}
            {mcpSelected && (
              <div
                data-testid="api-key-mcp-requirements"
                className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <p className="text-xs font-medium text-zinc-300">
                  MCP server — tools this key will unlock
                </p>
                <ul className="mt-2 space-y-1">
                  {RESOURCES.map((resource) => {
                    const enabled = selectedResources.has(resource);
                    return (
                      <li
                        key={resource}
                        data-testid={`api-key-mcp-tools-${resource}`}
                        className={`flex gap-2 text-xs ${
                          enabled ? "text-zinc-400" : "text-zinc-600"
                        }`}
                      >
                        <span
                          className={
                            enabled ? "text-green-500" : "text-zinc-600"
                          }
                        >
                          {enabled ? "✓" : "✗"}
                        </span>
                        <span>
                          <span className="capitalize">{resource}</span> —{" "}
                          <span className="font-mono">
                            {MCP_RESOURCE_TOOLS[resource]}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {!selectedResources.has("projects") && (
                  <p
                    data-testid="api-key-mcp-projects-warning"
                    className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400"
                  >
                    Without the projects resource, MCP clients cannot list or
                    search projects — most assistants start there, so every
                    session fails with a scope error. Enable projects for a
                    usable MCP key.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Expiry
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { id: "none", label: "No expiry" },
                  { id: "30d", label: "30 days" },
                  { id: "90d", label: "90 days" },
                  { id: "custom", label: "Custom date" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={expiryMode === option.id}
                  onClick={() => setExpiryMode(option.id)}
                  className={`${CHIP_BASE} ${
                    expiryMode === option.id
                      ? CHIP_SELECTED_GENERIC
                      : CHIP_UNSELECTED
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {expiryMode === "custom" && (
              <TerminalDatePicker
                id="api-key-expiry-custom"
                value={customExpiry}
                onChange={setCustomExpiry}
                min={new Date(Date.now() + 24 * 60 * 60 * 1000)
                  .toISOString()
                  .slice(0, 10)}
                placeholder="Pick an expiry date"
                className="mt-2"
              />
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <TerminalButton
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </TerminalButton>
            <TerminalButton type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Creating..." : "Create Key"}
            </TerminalButton>
          </div>
        </form>
      )}
    </DrawerPanel>
  );
}
