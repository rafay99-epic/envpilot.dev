"use client";

import { useState, useEffect, use, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import {
  TerminalWindow,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
  TerminalButton,
} from "@/components/dashboard/terminal-ui";
import { ENVIRONMENTS } from "@/constants/project";
import {
  GitCompareArrows,
  Search,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ChevronRight,
  Lock,
  Copy,
  Check,
} from "lucide-react";

// ─── Animation Variants ─────────────────────────────────────────────

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" as const },
  },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 },
  },
};

const rowVariant = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
  exit: {
    opacity: 0,
    x: 8,
    transition: { duration: 0.15 },
  },
};

const expandVariant = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: {
      height: { duration: 0.3, ease: "easeOut" as const },
      opacity: { duration: 0.25, delay: 0.05 },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      opacity: { duration: 0.15 },
      height: { duration: 0.25, ease: "easeIn" as const },
    },
  },
};

// ─── Types ──────────────────────────────────────────────────────────

interface Project {
  _id: Id<"projects">;
  name: string;
  slug: string;
  description?: string;
  organizationId: Id<"organizations">;
}

interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  vaultRef?: string;
  permission?: "read" | "write" | "admin" | null;
}

type DiffStatus = "matching" | "changed" | "missing";
type StatusFilter = "all" | DiffStatus;

interface EnvSlot {
  variable: Variable;
  vaultRef: string;
}

interface DiffRow {
  key: string;
  status: DiffStatus;
  isSensitive: boolean;
  description?: string;
  slots: Record<string, EnvSlot | null>;
}

// ─── Constants ──────────────────────────────────────────────────────

const ENV_META: Record<
  string,
  { short: string; dot: string; text: string; activeBg: string }
> = {
  development: {
    short: "DEV",
    dot: "bg-blue-400",
    text: "text-blue-400",
    activeBg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  },
  staging: {
    short: "STG",
    dot: "bg-amber-400",
    text: "text-amber-400",
    activeBg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  },
  production: {
    short: "PRD",
    dot: "bg-red-400",
    text: "text-red-400",
    activeBg: "bg-red-500/10 border-red-500/20 text-red-400",
  },
};

const STATUS_CFG = {
  matching: {
    icon: CheckCircle2,
    color: "text-green-500",
    gutter: "border-l-green-500/50",
    badge: "green" as const,
  },
  changed: {
    icon: AlertTriangle,
    color: "text-amber-500",
    gutter: "border-l-amber-500/50",
    badge: "amber" as const,
  },
  missing: {
    icon: XCircle,
    color: "text-red-500",
    gutter: "border-l-red-500/50",
    badge: "red" as const,
  },
};

// ─── Helpers ────────────────────────────────────────────────────────

function buildDiff(variables: Variable[], selectedEnvs: string[]) {
  const keyMap = new Map<string, Map<string, Variable>>();

  for (const v of variables) {
    for (const env of v.environments) {
      if (!selectedEnvs.includes(env)) continue;
      if (!keyMap.has(v.key)) keyMap.set(v.key, new Map());
      keyMap.get(v.key)!.set(env, v);
    }
  }

  const rows: DiffRow[] = [];

  for (const [key, envMap] of keyMap) {
    const slots: Record<string, EnvSlot | null> = {};
    const refs: string[] = [];
    let presentCount = 0;
    let isSensitive = false;
    let description: string | undefined;

    for (const env of selectedEnvs) {
      const v = envMap.get(env);
      if (!v || !v.vaultRef) {
        slots[env] = null;
      } else {
        presentCount++;
        refs.push(v.vaultRef);
        slots[env] = { variable: v, vaultRef: v.vaultRef };
        if (v.isSensitive) isSensitive = true;
        if (v.description && !description) description = v.description;
      }
    }

    let status: DiffStatus;
    if (presentCount < selectedEnvs.length) {
      status = "missing";
    } else if (refs.every((r) => r === refs[0])) {
      status = "matching";
    } else {
      status = "changed";
    }

    rows.push({ key, status, isSensitive, description, slots });
  }

  const order: Record<DiffStatus, number> = {
    missing: 0,
    changed: 1,
    matching: 2,
  };
  rows.sort(
    (a, b) => order[a.status] - order[b.status] || a.key.localeCompare(b.key)
  );

  return {
    rows,
    summary: {
      matching: rows.filter((r) => r.status === "matching").length,
      changed: rows.filter((r) => r.status === "changed").length,
      missing: rows.filter((r) => r.status === "missing").length,
      total: rows.length,
    },
  };
}

function formatDate(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

// ─── Page ───────────────────────────────────────────────────────────

export default function EnvironmentDiffPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { organization } = useAuthContext();

  const [project, setProject] = useState<Project | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [isLoadingVars, setIsLoadingVars] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([
    "development",
    "production",
  ]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [globalReveal, setGlobalReveal] = useState(false);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingRefs, setRevealingRefs] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Fetch project
  useEffect(() => {
    if (!organization?.id) {
      setIsLoadingProject(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/projects?organizationId=${organization.id}`
        );
        const data = await res.json();
        const found = data.projects?.find((p: Project) => p.slug === slug);
        if (found) setProject(found);
        else setError("Project not found");
      } catch {
        setError("Failed to load project");
      } finally {
        setIsLoadingProject(false);
      }
    })();
  }, [organization?.id, slug]);

  // Fetch ALL variables once
  useEffect(() => {
    if (!project) return;
    setIsLoadingVars(true);
    const t0 = performance.now();
    (async () => {
      try {
        const res = await fetch(`/api/variables?projectId=${project._id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch variables");
        setVariables(data.variables || []);
        setElapsedMs(Math.round(performance.now() - t0));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch variables"
        );
      } finally {
        setIsLoadingVars(false);
      }
    })();
  }, [project]);

  // Client-side diff
  const { rows, summary } = useMemo(
    () => buildDiff(variables, selectedEnvs),
    [variables, selectedEnvs]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (
          searchQuery &&
          !r.key.toLowerCase().includes(searchQuery.toLowerCase())
        )
          return false;
        return true;
      }),
    [rows, statusFilter, searchQuery]
  );

  // Environment toggle
  const toggleEnv = (env: string) => {
    setSelectedEnvs((prev) => {
      if (prev.includes(env))
        return prev.length <= 2 ? prev : prev.filter((e) => e !== env);
      return [...prev, env];
    });
  };

  // Reveal a single vault ref via existing /api/vault endpoint
  const revealValue = async (vaultRef: string) => {
    if (
      revealedValues[vaultRef] ||
      revealingRefs.has(vaultRef) ||
      !organization?.id
    )
      return;

    setRevealingRefs((prev) => new Set(prev).add(vaultRef));
    try {
      const res = await fetch(
        `/api/vault?vaultRef=${encodeURIComponent(vaultRef)}&organizationId=${encodeURIComponent(organization.id)}`
      );
      const data = await res.json();
      if (res.ok && data.data?.value) {
        setRevealedValues((prev) => ({ ...prev, [vaultRef]: data.data.value }));
      }
    } catch {
      // silently fail
    } finally {
      setRevealingRefs((prev) => {
        const next = new Set(prev);
        next.delete(vaultRef);
        return next;
      });
    }
  };

  // Reveal all refs for a row
  const revealRow = (row: DiffRow) => {
    const refs = Object.values(row.slots)
      .filter((s): s is EnvSlot => s !== null && !revealedValues[s.vaultRef])
      .map((s) => s.vaultRef);
    refs.forEach(revealValue);
  };

  // Global reveal toggle
  const handleGlobalReveal = () => {
    if (globalReveal) {
      setGlobalReveal(false);
      return;
    }
    setGlobalReveal(true);

    // Collect all unrevealed refs and batch-reveal
    const allRefs = new Set<string>();
    for (const row of rows) {
      for (const slot of Object.values(row.slots)) {
        if (slot?.vaultRef && !revealedValues[slot.vaultRef]) {
          allRefs.add(slot.vaultRef);
        }
      }
    }
    // Reveal in batches of 5
    const refs = Array.from(allRefs);
    const batch = async () => {
      for (let i = 0; i < refs.length; i += 5) {
        await Promise.all(refs.slice(i, i + 5).map(revealValue));
      }
    };
    batch();
  };

  // Copy value
  const copyValue = async (value: string, ref: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1500);
  };

  if (isLoadingProject) return <TerminalLoading fullPage />;
  if (error && !project) {
    return (
      <TerminalEmptyState
        command="envpilot diff --project not-found"
        message={error}
        action={{ label: "Back to Projects", href: "/dashboard/projects" }}
      />
    );
  }
  if (!project) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/projects/${project.slug}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="font-mono">
            <p className="text-xs text-zinc-500">
              <span className="text-green-400">$</span> envpilot diff --project{" "}
              <span className="text-zinc-300">{project.name}</span>
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-green-400" />
              <h1 className="text-lg font-bold text-zinc-100">
                Environment Diff
              </h1>
              {elapsedMs !== null && !isLoadingVars && (
                <span className="text-xs text-zinc-600">({elapsedMs}ms)</span>
              )}
            </div>
          </div>
        </div>

        {variables.length > 0 && (
          <TerminalButton
            variant={globalReveal ? "primary" : "secondary"}
            onClick={handleGlobalReveal}
            className="self-start sm:self-auto"
          >
            {globalReveal ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {globalReveal ? "Hide Values" : "Reveal All"}
          </TerminalButton>
        )}
      </div>

      {/* Environment Toggles */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className="text-zinc-600">--env</span>
        {ENVIRONMENTS.map((env) => {
          const isOn = selectedEnvs.includes(env);
          const meta = ENV_META[env];
          return (
            <button
              key={env}
              onClick={() => toggleEnv(env)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                isOn
                  ? meta.activeBg
                  : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${isOn ? meta.dot : "bg-zinc-700"}`}
              />
              {meta.short}
            </button>
          );
        })}
      </div>

      {isLoadingVars && <TerminalLoading />}

      {error && project && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 font-mono text-sm text-red-400">
          <span className="text-red-500">error:</span> {error}
        </div>
      )}

      {/* Summary + Search */}
      {!isLoadingVars && variables.length > 0 && (
        <motion.div variants={fadeIn} initial="hidden" animate="visible">
          <TerminalWindow title={`diff-summary — ${summary.total} variables`}>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3 font-mono text-sm sm:gap-5">
                {(["all", "matching", "changed", "missing"] as const).map(
                  (f) => {
                    const count = f === "all" ? summary.total : summary[f];
                    const active = statusFilter === f;
                    const cfg = f === "all" ? null : STATUS_CFG[f];
                    return (
                      <button
                        key={f}
                        onClick={() =>
                          setStatusFilter(active && f !== "all" ? "all" : f)
                        }
                        className={`flex items-center gap-1.5 transition-colors ${
                          active
                            ? cfg
                              ? cfg.color
                              : "text-zinc-100"
                            : "text-zinc-600 hover:text-zinc-400"
                        }`}
                      >
                        {cfg && <cfg.icon className="h-3.5 w-3.5" />}
                        <span>
                          {count} {f}
                        </span>
                      </button>
                    );
                  }
                )}
              </div>

              {summary.total > 0 && (
                <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  {summary.matching > 0 && (
                    <motion.div
                      className="bg-green-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(summary.matching / summary.total) * 100}%`,
                      }}
                      transition={{
                        duration: 0.6,
                        ease: "easeOut",
                        delay: 0.2,
                      }}
                    />
                  )}
                  {summary.changed > 0 && (
                    <motion.div
                      className="bg-amber-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(summary.changed / summary.total) * 100}%`,
                      }}
                      transition={{
                        duration: 0.6,
                        ease: "easeOut",
                        delay: 0.35,
                      }}
                    />
                  )}
                  {summary.missing > 0 && (
                    <motion.div
                      className="bg-red-500"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(summary.missing / summary.total) * 100}%`,
                      }}
                      transition={{
                        duration: 0.6,
                        ease: "easeOut",
                        delay: 0.5,
                      }}
                    />
                  )}
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                <input
                  type="text"
                  placeholder="grep variables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-500/20"
                />
              </div>
            </div>
          </TerminalWindow>
        </motion.div>
      )}

      {/* Diff Output */}
      {!isLoadingVars && variables.length > 0 && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <TerminalWindow title="diff-output">
            {filteredRows.length === 0 ? (
              <TerminalEmptyState
                command={`envpilot diff --filter ${statusFilter}${searchQuery ? ` --grep "${searchQuery}"` : ""}`}
                message={
                  rows.length === 0
                    ? "No variables found in the selected environments."
                    : "No variables match your filters."
                }
              />
            ) : (
              <div>
                {/* Desktop column header */}
                <div className="hidden border-b border-zinc-800/50 bg-zinc-800/20 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600 lg:flex">
                  <div className="w-7 shrink-0" />
                  <div className="min-w-[160px] flex-1">Key</div>
                  {selectedEnvs.map((env) => (
                    <div
                      key={env}
                      className={`flex-1 min-w-[140px] ${ENV_META[env].text}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${ENV_META[env].dot}`}
                        />
                        {env}
                      </span>
                    </div>
                  ))}
                </div>

                <motion.div
                  className="divide-y divide-zinc-800/30"
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  <AnimatePresence mode="popLayout">
                    {filteredRows.map((row) => (
                      <motion.div
                        key={row.key}
                        variants={rowVariant}
                        exit="exit"
                        layout
                      >
                        <DiffRowItem
                          row={row}
                          envs={selectedEnvs}
                          globalReveal={globalReveal}
                          revealedValues={revealedValues}
                          revealingRefs={revealingRefs}
                          isExpanded={expandedKey === row.key}
                          onToggleExpand={() =>
                            setExpandedKey((p) =>
                              p === row.key ? null : row.key
                            )
                          }
                          onRevealRow={() => revealRow(row)}
                          onRevealRef={revealValue}
                          copiedRef={copiedRef}
                          onCopy={copyValue}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>
            )}
          </TerminalWindow>
        </motion.div>
      )}

      {!isLoadingVars && variables.length === 0 && !error && (
        <motion.div variants={fadeIn} initial="hidden" animate="visible">
          <TerminalEmptyState
            command="envpilot diff"
            message="No variables in this project yet."
            action={{
              label: "Go to Variables",
              href: `/dashboard/projects/${project.slug}`,
            }}
          />
        </motion.div>
      )}
    </div>
  );
}

// ─── Diff Row ───────────────────────────────────────────────────────

function DiffRowItem({
  row,
  envs,
  globalReveal,
  revealedValues,
  revealingRefs,
  isExpanded,
  onToggleExpand,
  onRevealRow,
  onRevealRef,
  copiedRef,
  onCopy,
}: {
  row: DiffRow;
  envs: string[];
  globalReveal: boolean;
  revealedValues: Record<string, string>;
  revealingRefs: Set<string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRevealRow: () => void;
  onRevealRef: (ref: string) => void;
  copiedRef: string | null;
  onCopy: (value: string, ref: string) => void;
}) {
  const cfg = STATUS_CFG[row.status];

  // For "changed" rows, find which specific env values differ from the majority
  const diffHighlight = useMemo(() => {
    if (row.status !== "changed") return new Set<string>();
    const refCounts = new Map<string, number>();
    const envRefs = new Map<string, string>();
    for (const env of envs) {
      const ref = row.slots[env]?.vaultRef;
      if (ref) {
        refCounts.set(ref, (refCounts.get(ref) || 0) + 1);
        envRefs.set(env, ref);
      }
    }
    // Find the most common ref (the "base")
    let baseRef = "";
    let maxCount = 0;
    for (const [ref, count] of refCounts) {
      if (count > maxCount) {
        baseRef = ref;
        maxCount = count;
      }
    }
    // Highlight envs that differ from the base
    const highlighted = new Set<string>();
    for (const [env, ref] of envRefs) {
      if (ref !== baseRef) highlighted.add(env);
    }
    return highlighted;
  }, [row, envs]);

  // Auto-reveal when expanding with global reveal on
  useEffect(() => {
    if (isExpanded && globalReveal) {
      Object.values(row.slots)
        .filter((s): s is EnvSlot => s !== null && !revealedValues[s.vaultRef])
        .forEach((s) => onRevealRef(s.vaultRef));
    }
  }, [isExpanded, globalReveal, row.slots, revealedValues, onRevealRef]);

  return (
    <div className={`border-l-2 ${cfg.gutter}`}>
      {/* ── Desktop Row ── */}
      <div
        className="hidden cursor-pointer items-center px-4 py-2 transition-colors hover:bg-zinc-800/20 lg:flex"
        onClick={onToggleExpand}
      >
        {/* Chevron */}
        <div className="w-7 shrink-0">
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 ${isExpanded ? "text-zinc-500" : "text-zinc-600"}`}
            />
          </motion.div>
        </div>

        {/* Key */}
        <div className="flex min-w-[160px] flex-1 items-center gap-2">
          <code className="font-mono text-sm font-medium text-zinc-200">
            {row.key}
          </code>
          {row.isSensitive && <Lock className="h-3 w-3 text-amber-500/60" />}
          <TerminalBadge color={cfg.badge}>{row.status}</TerminalBadge>
        </div>

        {/* Inline values per environment */}
        {envs.map((env) => {
          const slot = row.slots[env];
          const meta = ENV_META[env];
          const revealed = slot ? revealedValues[slot.vaultRef] : undefined;
          const isRevealing = slot ? revealingRefs.has(slot.vaultRef) : false;
          const isDiff = diffHighlight.has(env);

          return (
            <div
              key={env}
              className={`flex min-w-[140px] flex-1 items-center gap-2 rounded px-2 py-1 ${
                !slot
                  ? "border border-dashed border-red-500/20"
                  : isDiff
                    ? "bg-amber-500/10"
                    : ""
              }`}
            >
              {!slot ? (
                <span className="font-mono text-xs text-red-500/50">
                  — not set
                </span>
              ) : isRevealing ? (
                <span className="flex items-center gap-1 font-mono text-xs text-zinc-500">
                  <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-400" />
                </span>
              ) : globalReveal && revealed ? (
                <code className="block max-w-[200px] truncate font-mono text-xs text-green-400">
                  {revealed}
                </code>
              ) : (
                <code className={`font-mono text-xs opacity-40 ${meta.text}`}>
                  ••••••••
                </code>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Mobile Row ── */}
      <div
        className="flex cursor-pointer flex-col px-4 py-3 transition-colors hover:bg-zinc-800/20 lg:hidden"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 ${isExpanded ? "text-zinc-500" : "text-zinc-600"}`}
            />
          </motion.div>
          <code className="font-mono text-sm font-medium text-zinc-200">
            {row.key}
          </code>
          {row.isSensitive && <Lock className="h-3 w-3 text-amber-500/60" />}
          <TerminalBadge color={cfg.badge}>{row.status}</TerminalBadge>
        </div>

        {/* Mobile env indicators */}
        <div className="mt-1.5 flex items-center gap-3 pl-6">
          {envs.map((env) => {
            const slot = row.slots[env];
            const meta = ENV_META[env];
            return (
              <span
                key={env}
                className={`flex items-center gap-1 font-mono text-[10px] ${slot ? meta.text : "text-zinc-700"}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${slot ? meta.dot : "bg-zinc-800"}`}
                />
                {meta.short}
                {!slot && <span className="text-red-500/50">✗</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Expanded Detail Panel ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            variants={expandVariant}
            initial="collapsed"
            animate="expanded"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800/30 bg-zinc-900/50 px-4 py-3 lg:ml-7">
              {row.description && (
                <p className="mb-3 font-mono text-xs text-zinc-500">
                  # {row.description}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {envs.map((env, i) => {
                  const slot = row.slots[env];
                  const meta = ENV_META[env];
                  const revealed = slot
                    ? revealedValues[slot.vaultRef]
                    : undefined;
                  const isRevealing = slot
                    ? revealingRefs.has(slot.vaultRef)
                    : false;
                  const isDiff = diffHighlight.has(env);

                  return (
                    <motion.div
                      key={env}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.2,
                        delay: i * 0.06,
                        ease: "easeOut",
                      }}
                      className={`rounded-lg border p-3 ${
                        !slot
                          ? "border-dashed border-red-500/20 bg-red-500/5"
                          : isDiff
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-zinc-800 bg-zinc-900/80"
                      }`}
                    >
                      {/* Env label */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`flex items-center gap-1.5 font-mono text-xs font-medium ${meta.text}`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${meta.dot}`}
                          />
                          {env}
                        </span>
                        {slot && (
                          <span className="font-mono text-[10px] text-zinc-600">
                            v{slot.variable.version} ·{" "}
                            {formatDate(slot.variable.updatedAt)}
                          </span>
                        )}
                      </div>

                      {/* Value */}
                      <div className="mt-2">
                        {!slot ? (
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <XCircle className="h-3 w-3 text-red-500/60" />
                            <span className="font-mono text-xs text-red-400/60">
                              not defined in this environment
                            </span>
                          </div>
                        ) : revealed ? (
                          <div className="group/val relative">
                            <code className="block break-all rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-green-400">
                              {revealed}
                            </code>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCopy(revealed, slot.vaultRef);
                              }}
                              className="absolute right-1 top-1 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-zinc-300 group-hover/val:opacity-100"
                              title="Copy"
                            >
                              {copiedRef === slot.vaultRef ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevealRef(slot.vaultRef);
                            }}
                            disabled={isRevealing}
                            className="flex w-full items-center gap-2 rounded bg-zinc-800/50 px-2 py-1.5 font-mono text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50"
                          >
                            {isRevealing ? (
                              <>
                                <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300" />
                                decrypting...
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3" />
                                click to reveal
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Mobile reveal all */}
              <div className="mt-2 lg:hidden">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevealRow();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
                >
                  <Eye className="h-3 w-3" />
                  Reveal all values
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
