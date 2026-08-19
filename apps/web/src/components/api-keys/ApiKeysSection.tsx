"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  Terminal as TerminalIcon,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import * as Sentry from "@sentry/nextjs";
import { SettingsField, SettingsSection } from "@envpilot/ui";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { DrawerPanel } from "@/components/ui";
import {
  TerminalButton,
  TerminalInput,
  TerminalBadge,
  TerminalLoading,
  TerminalEmptyState,
} from "@/components/dashboard/terminal-ui";
import { TerminalDatePicker } from "@/components/dashboard/terminal-date-picker";
import { useOrganizationProjects, useNow } from "@/hooks";
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
  development: "border-info-line bg-info-soft text-info",
  staging: "border-warning-line bg-warning-soft text-warning",
  production: "border-accent-line bg-accent-soft text-accent",
};

const RESOURCES = [
  "variables",
  "accounts",
  "files",
  "docs",
  "projects",
  "requests",
] as const;
type Resource = (typeof RESOURCES)[number];

// Resource pairs the backend refuses to mint together
// (convex/features/api/keys.ts::assertResourceCombination). Mirrored here so
// the form disables the second chip instead of failing on submit.
const MUTUALLY_EXCLUSIVE: Partial<Record<Resource, Resource>> = {
  docs: "files",
  files: "docs",
};

// "requests" is the one mutating capability: the key may FILE variable
// requests (a human approves them). Not compatible with the GitHub Action
// surface — CI can't wait on human approval.
const RESOURCE_HINT: Partial<Record<Resource, string>> = {
  requests: "may file variable requests for human approval (agents)",
  // Never on by default: this is the switch that lets a credential reach
  // keystores and signing material, not just env vars.
  files: "may read secret file contents (keystores, SSH keys, certificates)",
  // Excludes "files" — see MUTUALLY_EXCLUSIVE.
  docs: "may read published docs and propose drafts — not combinable with files",
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
  files: "envpilot_list_files, envpilot_get_file",
  docs: "envpilot_search_docs, envpilot_get_doc, envpilot_create_doc",
  requests: "envpilot_request_variable, envpilot_get_request_status",
};

/**
 * What the key is FOR, chosen before any chip. Each preset is a combination the
 * backend already accepts, so the common paths cannot produce a key that mints
 * and then fails on first use. "custom" opts out and opens the advanced block.
 *
 * Presets set surfaces and resources only — project and environment scope stay
 * a deliberate choice, because no default is safe for every org.
 */
const PRESETS = [
  {
    id: "agent",
    label: "Agent / MCP",
    blurb: "Claude, Cursor, Codex",
    surfaces: ["mcp_server"],
    resources: ["variables", "projects"],
  },
  {
    id: "action",
    label: "GitHub Action",
    blurb: "CI pulls variables",
    surfaces: ["github_action"],
    resources: ["variables"],
  },
  {
    id: "docker",
    label: "Docker",
    blurb: "containers, VPS",
    surfaces: ["docker"],
    resources: ["variables"],
  },
  {
    id: "rest",
    label: "REST read-only",
    blurb: "scripts, dashboards",
    surfaces: ["rest_api"],
    resources: ["variables"],
  },
  {
    id: "custom",
    label: "Custom",
    blurb: "choose everything",
    surfaces: [],
    resources: [],
  },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

const SURFACES = ["rest_api", "mcp_server", "github_action", "docker"] as const;
type Surface = (typeof SURFACES)[number];

const SURFACE_LABEL: Record<Surface, string> = {
  rest_api: "REST API",
  mcp_server: "MCP server",
  github_action: "GitHub Action",
  docker: "Docker",
};

const CHIP_BASE =
  "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors";
const CHIP_UNSELECTED =
  "border-line bg-surface text-ink-subtle hover:border-line-strong hover:text-ink-muted";
const CHIP_SELECTED_GENERIC = "border-accent-line bg-accent-soft text-accent";
const CHIP_SELECTED_PURPLE = "border-premium-line bg-premium-soft text-premium";

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
 * keys for the public REST API, MCP server, GitHub Action and Docker image (the one
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
      fallbackVariant="line"
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
  // Every open gets a fresh drawer instance. Remounting IS the form reset —
  // including the one-time plaintext key, which must never survive into the
  // next run. The drawer stays rendered while closed so DrawerPanel can play
  // its slide-out.
  const [createSession, setCreateSession] = useState(0);
  const openCreate = () => {
    setCreateSession((n) => n + 1);
    setShowCreate(true);
  };

  return (
    <SettingsSection
      title="API keys"
      description="Scoped keys for the public REST API, MCP server, GitHub Action, and Docker image. Read-only — except keys with the requests resource, which may file variable requests for human approval."
    >
      <div className="flex justify-end">
        <TerminalButton type="button" variant="primary" onClick={openCreate}>
          New Key
        </TerminalButton>
      </div>

      {organizationId && (
        <CreateKeyDrawer
          key={createSession}
          organizationId={organizationId}
          isOwner={isOwner}
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

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
          className="divide-y divide-line border-t border-line"
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
    </SettingsSection>
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

  const now = useNow(60_000);

  const recentlyUsed =
    keyItem.lastUsedAt !== null &&
    now > 0 &&
    now - keyItem.lastUsedAt < SEVEN_DAYS_MS;

  const expiryMsLeft =
    keyItem.expiresAt !== null && now > 0 ? keyItem.expiresAt - now : null;
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
            <span className="truncate font-mono text-sm font-medium text-ink">
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
          <p className="mt-1 font-mono text-xs text-ink-muted">
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
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
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
                  recentlyUsed ? "bg-accent" : "bg-surface-hover"
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

      {/* `m` + LazyMotion keeps the unused Motion features (drag, layout
          projection) out of the bundle; this row only animates opacity and a
          grid track, both covered by `domAnimation`.

          The boundary stays mounted and both conditions sit on the child:
          revoking a key while its confirm strip is open used to unmount
          AnimatePresence along with the strip, so it never saw the child
          leave and the strip vanished instead of animating out. */}
      <LazyMotion features={domAnimation}>
        <AnimatePresence initial={false}>
          {!isRevoked && confirming && (
            <m.div
              key="confirm"
              // The row expands by interpolating the grid track, not
              // `height` — animating height forces a full layout pass every
              // frame and makes Motion measure the element to resolve
              // "auto".
              initial={{ opacity: 0, gridTemplateRows: "0fr" }}
              animate={{ opacity: 1, gridTemplateRows: "1fr" }}
              exit={{ opacity: 0, gridTemplateRows: "0fr" }}
              transition={{ duration: 0.15 }}
              className="grid"
            >
              <div className="overflow-hidden">
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-danger-line/40 pt-3">
                  <div className="min-w-0">
                    <p className="flex items-start gap-2 text-xs text-danger">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Revoke this key? Anything using it will stop working
                      immediately.
                    </p>
                    {rowError && (
                      <p className="mt-1 text-xs font-medium text-danger">
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
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
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

/**
 * CALLER CONTRACT: pass a fresh `key` on every open. Mounting is what resets
 * this form, including the one-time plaintext key, which must never survive
 * into the next run. Nothing here copies defaults back over the previous
 * run's state, so there is no window where a stale value is on screen.
 */
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
  // Seeded from the default preset ("agent"), so the chips the form opens on
  // and the preset it says it is on cannot disagree.
  const [selectedSurfaces, setSelectedSurfaces] = useState<Set<Surface>>(
    new Set<Surface>(["mcp_server"])
  );
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>("none");
  const [customExpiry, setCustomExpiry] = useState("");
  // The earliest expiry a key may carry: tomorrow, resolved once the browser
  // supplies a clock. The drawer is keyed per open, so that is also the moment
  // "tomorrow" gets fixed — it cannot drift if the form is left open across
  // midnight.
  const nowMs = useNow();
  const minExpiryDate = nowMs
    ? new Date(nowMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : "";

  const [preset, setPreset] = useState<PresetId>("agent");
  // Problems are computed on every render but only SHOWN once the user has
  // tried to create — an empty form should not open scolding.
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);

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
        // Selecting one half of an exclusive pair clears the other, so the
        // form can never submit a combination the backend refuses.
        const excluded = MUTUALLY_EXCLUSIVE[resource];
        if (excluded) next.delete(excluded);
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
    // The Action pull path only accepts single-project keys carrying
    // "variables", optionally plus "files" — steer the form into that shape
    // instead of failing at submit. Anything else the user had picked is
    // dropped; "files" is kept because an Action key may legitimately pull
    // keystores.
    if (adding && surface === "github_action") {
      setProjectMode("specific");
      setSelectedResources((prev) => {
        const next = new Set<Resource>(["variables"]);
        if (prev.has("files")) next.add("files");
        return next;
      });
    }
  };

  const githubActionSelected = selectedSurfaces.has("github_action");
  const mcpSelected = selectedSurfaces.has("mcp_server");

  const projectSelectionValid = githubActionSelected
    ? projectMode === "specific" && selectedProjectIds.size === 1
    : projectMode === "all" || selectedProjectIds.size > 0;
  const envSelectionValid = envMode === "all" || selectedEnvs.size > 0;
  // Matches convex/features/api/keys.ts: an Action key must carry
  // "variables" and may additionally carry "files" — nothing else, so an
  // Action credential never doubles as broader REST/MCP access. The form
  // previously demanded EXACTLY variables, which made a files-capable Action
  // key impossible to create at all.
  const resourceSelectionValid =
    selectedResources.size > 0 &&
    (!githubActionSelected ||
      (selectedResources.has("variables") &&
        [...selectedResources].every(
          (r) => r === "variables" || r === "files"
        )));
  const surfaceSelectionValid = selectedSurfaces.size > 0;
  const customExpiryValid =
    expiryMode !== "custom" ||
    (customExpiry.length > 0 &&
      nowMs > 0 &&
      new Date(customExpiry).getTime() > nowMs);

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    const chosen = PRESETS.find((p) => p.id === id);
    if (!chosen || id === "custom") return;
    setSelectedSurfaces(
      new Set<Surface>(chosen.surfaces as readonly Surface[])
    );
    setSelectedResources(
      new Set<Resource>(chosen.resources as readonly Resource[])
    );
    // The Action pull endpoint takes no project parameter, so its key IS the
    // project scope — force the shape the backend will accept.
    if (id === "action") setProjectMode("specific");
  };

  /**
   * Every reason this key cannot be created, in the order the fields appear.
   * Mirrors convex/features/api/keys.ts one-for-one: the point is that the
   * user reads the rule HERE instead of after a failed round trip.
   */
  const problems: { field: string; message: string }[] = [];
  if (name.trim().length === 0) {
    problems.push({
      field: "name",
      message: "Name your key (1–100 characters).",
    });
  } else if (name.trim().length > 100) {
    problems.push({ field: "name", message: "Name must be 1–100 characters." });
  }
  if (!surfaceSelectionValid) {
    problems.push({
      field: "surfaces",
      message: "Pick at least one surface — where this key may be used.",
    });
  }
  if (!projectSelectionValid) {
    problems.push({
      field: "projects",
      message: githubActionSelected
        ? "A GitHub Action key must be scoped to exactly one project — the Action's pull endpoint takes no project parameter."
        : "Pick at least one project, or scope the key to all projects.",
    });
  }
  if (!envSelectionValid) {
    problems.push({
      field: "environments",
      message:
        "Pick at least one environment, or scope the key to all of them.",
    });
  }
  if (selectedResources.size === 0) {
    problems.push({
      field: "resources",
      message: "Pick at least one resource — a key with none can read nothing.",
    });
  } else if (!resourceSelectionValid) {
    problems.push({
      field: "resources",
      message:
        'A GitHub Action key must carry "variables", and may additionally carry "files" — nothing else.',
    });
  }
  if (selectedResources.has("docs") && selectedResources.has("files")) {
    problems.push({
      field: "resources",
      message:
        'A key cannot carry both "docs" and "files" — docs are text an agent reads into context, and file access returns decrypted key material. Mint two keys.',
    });
  }
  if (!customExpiryValid) {
    problems.push({
      field: "expiry",
      message: "Pick an expiry date in the future.",
    });
  }

  const mcpToolCount = RESOURCES.filter((r) => selectedResources.has(r)).length;

  const showProblems = triedSubmit && problems.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    // Never a dead button: a click with gaps explains them instead of doing
    // nothing, which is the whole reason this form was confusing.
    if (problems.length > 0) {
      document
        .getElementById("api-key-problems")
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (isSubmitting) return;

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
            <Check className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-accent">Key created</h3>
          </div>

          <p className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">
                Copy it now. You won&apos;t see this key again.
              </span>{" "}
              Envpilot only stores its hash.
            </span>
          </p>

          {/* The one bordered block on this surface: copyable terminal output
              shown exactly once, where the emphasis is the point. */}
          <SettingsField label="API key">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-panel border border-line bg-surface px-3 py-2 font-mono text-xs text-ink">
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
          </SettingsField>

          {mcpSelected && (
            <p
              data-testid="api-key-mcp-rotation-hint"
              className="text-xs text-ink-muted"
            >
              Replacing a key in an existing MCP setup? Swap this key into your
              client&apos;s Authorization header (or the exported{" "}
              <code className="rounded bg-surface-raised px-1 py-0.5">
                ENVPILOT_API_KEY
              </code>
              ), confirm a tool call works, then revoke the old key below.
              Claude Code refuses to re-add an existing server, so run{" "}
              <code className="rounded bg-surface-raised px-1 py-0.5">
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
              className="flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <TerminalIcon className="h-3.5 w-3.5" />
              curl usage
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showSnippet ? "rotate-180" : ""
                }`}
              />
            </button>
            <LazyMotion features={domAnimation}>
              <AnimatePresence initial={false}>
                {showSnippet && (
                  <m.div
                    key="snippet"
                    // Grid track instead of `height` — see the revoke strip in
                    // KeyRow for why.
                    initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                    animate={{ gridTemplateRows: "1fr", opacity: 1 }}
                    exit={{ gridTemplateRows: "0fr", opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="grid"
                  >
                    <div className="overflow-hidden">
                      <pre className="mt-2 overflow-x-auto rounded-panel bg-canvas px-3 py-3 text-xs text-ink-muted">
                        {`curl -H "Authorization: Bearer $ENVPILOT_API_KEY" \\
  "https://www.envpilot.dev/api/v1/projects/{slug}/variables?environment=production"`}
                      </pre>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Store the key as the{" "}
                        <code className="rounded bg-surface-raised px-1 py-0.5">
                          ENVPILOT_API_KEY
                        </code>{" "}
                        environment variable, and replace{" "}
                        <code className="rounded bg-surface-raised px-1 py-0.5">
                          {"{slug}"}
                        </code>{" "}
                        with your project&apos;s slug.
                      </p>
                    </div>
                  </m.div>
                )}
              </AnimatePresence>
            </LazyMotion>
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
            <p className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {showProblems && (
            <div
              id="api-key-problems"
              data-testid="api-key-problems"
              role="alert"
              className="border-l-2 border-danger py-1 pl-3"
            >
              <p className="text-sm font-medium text-danger">
                {problems.length === 1
                  ? "One thing left before this key can be created"
                  : `${problems.length} things left before this key can be created`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {problems.map((problem) => (
                  <li
                    key={`${problem.field}-${problem.message}`}
                    className="text-sm text-ink-muted"
                  >
                    <span className="font-mono text-[12px] text-ink-subtle">
                      {problem.field}:
                    </span>{" "}
                    {problem.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <SettingsField
            label="What is this key for?"
            required
            hint="Presets pick a surface and resources that are known to work together. Everything stays editable under Advanced."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((option) => {
                const selected = preset === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    data-testid={`api-key-preset-${option.id}`}
                    aria-pressed={selected}
                    onClick={() => applyPreset(option.id)}
                    className={`rounded-panel px-3 py-2 text-left ring-1 transition-colors ${
                      selected
                        ? "bg-accent-soft text-accent ring-accent-line"
                        : "text-ink-muted ring-line hover:text-ink hover:ring-line-strong"
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="block text-xs text-ink-subtle">
                      {option.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </SettingsField>

          <SettingsField
            label="Name"
            htmlFor="api-key-name"
            required
            hint={`1–100 characters · ${name.trim().length}/100`}
            error={
              showProblems
                ? (problems.find((p) => p.field === "name")?.message ?? null)
                : null
            }
          >
            <TerminalInput
              id="api-key-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. deploy-pipeline"
              maxLength={100}
              aria-invalid={
                showProblems && problems.some((p) => p.field === "name")
              }
            />
          </SettingsField>

          <SettingsField label="Projects" required>
            <div className="flex flex-wrap gap-2">
              {isOwner && !githubActionSelected && (
                <button
                  type="button"
                  aria-pressed={projectMode === "all"}
                  onClick={() => setProjectMode("all")}
                  className={`${CHIP_BASE} normal-case ${
                    projectMode === "all"
                      ? CHIP_SELECTED_GENERIC
                      : CHIP_UNSELECTED
                  }`}
                >
                  All projects (includes future ones)
                </button>
              )}
              <button
                type="button"
                aria-pressed={projectMode === "specific"}
                onClick={() => setProjectMode("specific")}
                className={`${CHIP_BASE} normal-case ${
                  projectMode === "specific"
                    ? CHIP_SELECTED_GENERIC
                    : CHIP_UNSELECTED
                }`}
              >
                Specific projects
              </button>
            </div>

            {projectMode === "specific" && (
              <div className="mt-3 max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
                {projectsLoading ? (
                  <p className="py-2 text-xs text-ink-subtle">
                    Loading projects...
                  </p>
                ) : projects.length === 0 ? (
                  <p className="py-2 text-xs text-ink-subtle">
                    No projects yet.
                  </p>
                ) : (
                  projects.map((project) => (
                    <label
                      key={project._id}
                      data-testid={`api-key-project-${project.slug}`}
                      className="flex cursor-pointer items-center gap-2 py-2 text-sm text-ink-muted hover:text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.has(project._id)}
                        onChange={() => toggleProject(project._id)}
                        className="h-4 w-4 rounded border-line-strong bg-surface-raised text-accent focus:ring-1 focus:ring-accent-line"
                      />
                      {project.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </SettingsField>

          <SettingsField
            label="Environments"
            required
            hint="Recommended: scope keys to a single environment."
          >
            <div className="flex flex-wrap gap-2">
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
          </SettingsField>

          <details
            className="border-t border-line pt-4"
            open={preset === "custom" || showProblems}
          >
            <summary
              data-testid="api-key-advanced"
              className="cursor-pointer list-none font-mono text-[12px] text-ink-subtle transition-colors hover:text-ink [&::-webkit-details-marker]:hidden"
            >
              <span aria-hidden className="mr-2 text-accent">
                &#9656;
              </span>
              Advanced: surfaces, resources, expiry
            </summary>

            <div className="mt-4 space-y-5">
              <SettingsField
                label="Surfaces"
                required
                hint={
                  githubActionSelected
                    ? "A GitHub Action key is locked to exactly one project and the variables resource — the Action's pull endpoint takes no project parameter."
                    : "Where this key may be used. The GitHub Action pulls variables for a single project."
                }
              >
                <div className="flex flex-wrap gap-2">
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
              </SettingsField>

              <SettingsField
                label="Resources"
                required
                hint={
                  selectedResources.has("requests")
                    ? "This key may file variable requests over MCP — a human approves them in the dashboard and supplies the value. Keys never write secrets."
                    : undefined
                }
              >
                <div className="flex flex-wrap gap-2">
                  {RESOURCES.map((resource) => {
                    const selected = selectedResources.has(resource);
                    // The Action pulls variables and, optionally, secret files.
                    // Everything else stays off so an Action credential never
                    // doubles as broader REST/MCP access.
                    const disabled =
                      githubActionSelected &&
                      resource !== "variables" &&
                      resource !== "files";
                    // The other half of an exclusive pair stays clickable — it
                    // swaps the selection rather than being blocked — but says so.
                    const excluded = MUTUALLY_EXCLUSIVE[resource];
                    const swaps = Boolean(
                      excluded && selectedResources.has(excluded)
                    );
                    return (
                      <button
                        key={resource}
                        type="button"
                        data-testid={`api-key-resource-${resource}`}
                        aria-pressed={selected}
                        disabled={disabled}
                        title={
                          disabled
                            ? "GitHub Action keys carry variables, and optionally files — nothing else"
                            : swaps
                              ? `Selecting "${resource}" clears "${excluded}" — a key cannot carry both`
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
              </SettingsField>

              {mcpSelected && (
                <div data-testid="api-key-mcp-requirements">
                  {/* The full tool list is six lines of mono the moment MCP is
                      picked, which buried the fields under it. Headline first,
                      list on demand. */}
                  <details>
                    <summary className="cursor-pointer list-none text-xs font-medium text-ink-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                      <span aria-hidden className="mr-1.5 text-accent">
                        &#9656;
                      </span>
                      MCP server: {mcpToolCount} of {RESOURCES.length} resource
                      groups unlock tools
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {RESOURCES.map((resource) => {
                        const enabled = selectedResources.has(resource);
                        return (
                          <li
                            key={resource}
                            data-testid={`api-key-mcp-tools-${resource}`}
                            className={`flex gap-2 text-xs ${
                              enabled ? "text-ink-muted" : "text-ink-faint"
                            }`}
                          >
                            <span
                              className={
                                enabled ? "text-accent" : "text-ink-faint"
                              }
                            >
                              {enabled ? "✓" : "✗"}
                            </span>
                            <span>
                              <span className="capitalize">{resource}</span>:{" "}
                              <span className="font-mono">
                                {MCP_RESOURCE_TOOLS[resource]}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                  {!selectedResources.has("projects") && (
                    <p
                      data-testid="api-key-mcp-projects-warning"
                      className="mt-2 flex items-start gap-2 text-xs text-warning"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Without the projects resource, MCP clients cannot list or
                      search projects. Most assistants start there, so every
                      session fails with a scope error. Enable projects for a
                      usable MCP key.
                    </p>
                  )}
                </div>
              )}

              <SettingsField label="Expiry" optional>
                <div className="flex flex-wrap gap-2">
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
                    min={minExpiryDate}
                    placeholder="Pick an expiry date"
                    className="mt-2"
                  />
                )}
              </SettingsField>
            </div>
          </details>

          <div className="flex justify-end gap-3 pt-2">
            <TerminalButton
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </TerminalButton>
            <TerminalButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Key"}
            </TerminalButton>
          </div>
        </form>
      )}
    </DrawerPanel>
  );
}
