"use client";

import { useState, useEffect, use, useMemo, useCallback, useRef } from "react";
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
  Download,
  ArrowDownAZ,
  ArrowUpAZ,
  Clock,
  Shapes,
  ChevronDown,
  Sparkles,
  ArrowRight,
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
  permission?: "read" | "write" | null;
}

type DiffStatus = "matching" | "changed" | "missing";
type StatusFilter = "all" | DiffStatus;
type SortMode = "status" | "az" | "za" | "recent";

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
  latestUpdate: number;
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
    let latestUpdate = 0;

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
        if (v.updatedAt > latestUpdate) latestUpdate = v.updatedAt;
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

    rows.push({
      key,
      status,
      isSensitive,
      description,
      slots,
      latestUpdate,
    });
  }

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

function sortRows(rows: DiffRow[], mode: SortMode): DiffRow[] {
  const out = [...rows];
  switch (mode) {
    case "az":
      out.sort((a, b) => a.key.localeCompare(b.key));
      break;
    case "za":
      out.sort((a, b) => b.key.localeCompare(a.key));
      break;
    case "recent":
      out.sort((a, b) => b.latestUpdate - a.latestUpdate);
      break;
    case "status":
    default: {
      const order: Record<DiffStatus, number> = {
        missing: 0,
        changed: 1,
        matching: 2,
      };
      out.sort(
        (a, b) =>
          order[a.status] - order[b.status] || a.key.localeCompare(b.key)
      );
    }
  }
  return out;
}

function formatDate(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

function escapeEnvValue(value: string): string {
  if (/[\s"'$`\\#=]/.test(value) || value === "") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [globalReveal, setGlobalReveal] = useState(false);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingRefs, setRevealingRefs] = useState<Set<string>>(new Set());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const exportMenuRef = useRef<HTMLDivElement | null>(null);

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

  // Click-outside for export menu
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setExportOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  // Client-side diff
  const { rows, summary } = useMemo(
    () => buildDiff(variables, selectedEnvs),
    [variables, selectedEnvs]
  );

  // Apply value-aware reclassification: if a "changed" row has all values revealed
  // and they actually match (vault refs differ but content is identical), surface it.
  const contentMatchKeys = useMemo(() => {
    const matched = new Set<string>();
    for (const row of rows) {
      if (row.status !== "changed") continue;
      const slotValues: string[] = [];
      let allRevealed = true;
      for (const env of selectedEnvs) {
        const slot = row.slots[env];
        if (!slot) {
          allRevealed = false;
          break;
        }
        const v = revealedValues[slot.vaultRef];
        if (v === undefined) {
          allRevealed = false;
          break;
        }
        slotValues.push(v);
      }
      if (allRevealed && slotValues.every((v) => v === slotValues[0])) {
        matched.add(row.key);
      }
    }
    return matched;
  }, [rows, selectedEnvs, revealedValues]);

  const sortedRows = useMemo(() => sortRows(rows, sortMode), [rows, sortMode]);

  const filteredRows = useMemo(
    () =>
      sortedRows.filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (sensitiveOnly && !r.isSensitive) return false;
        if (
          searchQuery &&
          !r.key.toLowerCase().includes(searchQuery.toLowerCase())
        )
          return false;
        return true;
      }),
    [sortedRows, statusFilter, sensitiveOnly, searchQuery]
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
  const revealValue = useCallback(
    async (vaultRef: string) => {
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
          setRevealedValues((prev) => ({
            ...prev,
            [vaultRef]: data.data.value,
          }));
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
    },
    [organization?.id, revealedValues, revealingRefs]
  );

  // Reveal all refs for a row
  const revealRow = useCallback(
    (row: DiffRow) => {
      const refs = Object.values(row.slots)
        .filter((s): s is EnvSlot => s !== null && !revealedValues[s.vaultRef])
        .map((s) => s.vaultRef);
      refs.forEach(revealValue);
    },
    [revealedValues, revealValue]
  );

  // Reveal all refs for an env column (for "Copy column" action)
  const revealColumn = useCallback(
    async (env: string) => {
      const refs = new Set<string>();
      for (const row of rows) {
        const slot = row.slots[env];
        if (slot && !revealedValues[slot.vaultRef]) {
          refs.add(slot.vaultRef);
        }
      }
      const list = Array.from(refs);
      // Batch in parallel groups of 5
      for (let i = 0; i < list.length; i += 5) {
        await Promise.all(list.slice(i, i + 5).map(revealValue));
      }
    },
    [rows, revealedValues, revealValue]
  );

  // Global reveal toggle
  const handleGlobalReveal = () => {
    if (globalReveal) {
      setGlobalReveal(false);
      return;
    }
    setGlobalReveal(true);

    const allRefs = new Set<string>();
    for (const row of rows) {
      for (const slot of Object.values(row.slots)) {
        if (slot?.vaultRef && !revealedValues[slot.vaultRef]) {
          allRefs.add(slot.vaultRef);
        }
      }
    }
    const refs = Array.from(allRefs);
    const batch = async () => {
      for (let i = 0; i < refs.length; i += 5) {
        await Promise.all(refs.slice(i, i + 5).map(revealValue));
      }
    };
    batch();
  };

  // Copy value
  const copyValue = useCallback(async (value: string, ref: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1500);
  }, []);

  // Copy a whole env column as .env block
  const copyColumn = async (env: string) => {
    await revealColumn(env);
    // Wait a tick so the new revealed values are observable in state
    await new Promise((r) => setTimeout(r, 50));
    const lines: string[] = [];
    // Use latest snapshot — read via callback
    setRevealedValues((current) => {
      for (const row of filteredRows) {
        const slot = row.slots[env];
        if (!slot) continue;
        const v = current[slot.vaultRef];
        if (v !== undefined) {
          lines.push(`${row.key}=${escapeEnvValue(v)}`);
        }
      }
      return current;
    });
    if (lines.length === 0) {
      setToast(`No revealed values to copy for ${env}`);
      return;
    }
    await navigator.clipboard.writeText(lines.join("\n") + "\n");
    setToast(
      `Copied ${lines.length} ${lines.length === 1 ? "var" : "vars"} from ${env}`
    );
  };

  // Quick action: copy value from one env's slot to clipboard with a note about target env
  const copyForSync = async (
    sourceVal: string,
    sourceEnv: string,
    targetEnv: string,
    key: string,
    ref: string
  ) => {
    await navigator.clipboard.writeText(sourceVal);
    setCopiedRef(`${ref}::${targetEnv}`);
    setTimeout(() => setCopiedRef(null), 1500);
    setToast(`Copied ${key} from ${sourceEnv} → paste into ${targetEnv}`);
  };

  // ── Exports ──────────────────────────────────────────────────────

  const exportEnvFile = async (env: string) => {
    await revealColumn(env);
    await new Promise((r) => setTimeout(r, 50));
    setRevealedValues((current) => {
      const lines: string[] = [
        `# ${project?.name ?? "envpilot"} — ${env}`,
        `# Exported ${new Date().toISOString()}`,
        "",
      ];
      for (const row of sortedRows) {
        const slot = row.slots[env];
        if (!slot) continue;
        const v = current[slot.vaultRef];
        if (v !== undefined) {
          if (row.description) lines.push(`# ${row.description}`);
          lines.push(`${row.key}=${escapeEnvValue(v)}`);
        }
      }
      const filename = `${project?.slug ?? "envpilot"}.${env}.env`;
      downloadBlob(filename, lines.join("\n") + "\n", "text/plain");
      setToast(`Downloaded ${filename}`);
      return current;
    });
  };

  const exportDiffJSON = () => {
    const data = {
      project: project
        ? { id: project._id, name: project.name, slug: project.slug }
        : null,
      environments: selectedEnvs,
      generatedAt: new Date().toISOString(),
      summary,
      variables: sortedRows.map((row) => ({
        key: row.key,
        status: contentMatchKeys.has(row.key)
          ? ("matching" as DiffStatus)
          : row.status,
        sensitive: row.isSensitive,
        description: row.description,
        environments: Object.fromEntries(
          selectedEnvs.map((env) => {
            const slot = row.slots[env];
            return [
              env,
              slot
                ? {
                    present: true,
                    version: slot.variable.version,
                    updatedAt: slot.variable.updatedAt,
                    vaultRef: slot.vaultRef,
                  }
                : { present: false },
            ];
          })
        ),
      })),
    };
    const filename = `${project?.slug ?? "envpilot"}.diff.json`;
    downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
    setToast(`Downloaded ${filename}`);
  };

  const exportDiffMarkdown = () => {
    const lines: string[] = [];
    lines.push(
      `# Environment Diff — ${project?.name ?? "envpilot"}`,
      "",
      `_Generated ${new Date().toISOString()}_`,
      "",
      `**Environments:** ${selectedEnvs.join(", ")}`,
      "",
      `| | Count |`,
      `|---|---|`,
      `| Matching | ${summary.matching} |`,
      `| Changed | ${summary.changed} |`,
      `| Missing | ${summary.missing} |`,
      `| **Total** | **${summary.total}** |`,
      "",
      "## Variables",
      "",
      `| Key | Status | ${selectedEnvs.join(" | ")} |`,
      `|---|---|${selectedEnvs.map(() => "---").join("|")}|`
    );
    for (const row of sortedRows) {
      const status = contentMatchKeys.has(row.key)
        ? "matching (content)"
        : row.status;
      const cells = selectedEnvs.map((env) => (row.slots[env] ? "✓" : "—"));
      const sensitive = row.isSensitive ? " 🔒" : "";
      lines.push(
        `| \`${row.key}\`${sensitive} | ${status} | ${cells.join(" | ")} |`
      );
    }
    const filename = `${project?.slug ?? "envpilot"}.diff.md`;
    downloadBlob(filename, lines.join("\n") + "\n", "text/markdown");
    setToast(`Downloaded ${filename}`);
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
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="relative" ref={exportMenuRef}>
              <TerminalButton
                variant="secondary"
                onClick={() => setExportOpen((o) => !o)}
              >
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${exportOpen ? "rotate-180" : ""}`}
                />
              </TerminalButton>
              <AnimatePresence>
                {exportOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-1 font-mono text-xs shadow-xl"
                  >
                    <div className="border-b border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
                      Per environment
                    </div>
                    {selectedEnvs.map((env) => (
                      <button
                        key={env}
                        onClick={() => {
                          setExportOpen(false);
                          exportEnvFile(env);
                        }}
                        className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${ENV_META[env].dot}`}
                          />
                          {`${env}.env`}
                        </span>
                        <Download className="h-3 w-3 text-zinc-600" />
                      </button>
                    ))}
                    <div className="mt-1 border-t border-zinc-800 px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-600">
                      Diff report
                    </div>
                    <button
                      onClick={() => {
                        setExportOpen(false);
                        exportDiffJSON();
                      }}
                      className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <span>diff.json</span>
                      <Download className="h-3 w-3 text-zinc-600" />
                    </button>
                    <button
                      onClick={() => {
                        setExportOpen(false);
                        exportDiffMarkdown();
                      }}
                      className="flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <span>diff.md</span>
                      <Download className="h-3 w-3 text-zinc-600" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <TerminalButton
              variant={globalReveal ? "primary" : "secondary"}
              onClick={handleGlobalReveal}
            >
              {globalReveal ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {globalReveal ? "Hide Values" : "Reveal All"}
            </TerminalButton>
          </div>
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

      {/* Summary + Search + Sort + Sensitive */}
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

              {/* Search + sort + sensitive controls */}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="text"
                    placeholder="grep variables..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 font-mono text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/30 focus:outline-none focus:ring-1 focus:ring-green-500/20"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
                  <SortChip
                    active={sortMode === "status"}
                    onClick={() => setSortMode("status")}
                    icon={<Shapes className="h-3 w-3" />}
                    label="status"
                  />
                  <SortChip
                    active={sortMode === "az"}
                    onClick={() => setSortMode("az")}
                    icon={<ArrowDownAZ className="h-3 w-3" />}
                    label="A-Z"
                  />
                  <SortChip
                    active={sortMode === "za"}
                    onClick={() => setSortMode("za")}
                    icon={<ArrowUpAZ className="h-3 w-3" />}
                    label="Z-A"
                  />
                  <SortChip
                    active={sortMode === "recent"}
                    onClick={() => setSortMode("recent")}
                    icon={<Clock className="h-3 w-3" />}
                    label="recent"
                  />
                </div>

                <button
                  onClick={() => setSensitiveOnly((s) => !s)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                    sensitiveOnly
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                  title="Show only variables marked sensitive"
                >
                  <Lock className="h-3 w-3" />
                  sensitive only
                </button>
              </div>

              {/* Active filter summary */}
              {(statusFilter !== "all" ||
                sensitiveOnly ||
                searchQuery ||
                sortMode !== "status") && (
                <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-600">
                  <span>
                    Showing {filteredRows.length} of {summary.total}
                  </span>
                  {(statusFilter !== "all" || sensitiveOnly || searchQuery) && (
                    <button
                      onClick={() => {
                        setStatusFilter("all");
                        setSensitiveOnly(false);
                        setSearchQuery("");
                      }}
                      className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                    >
                      reset filters
                    </button>
                  )}
                </div>
              )}
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
                {/* Desktop column header w/ per-column actions */}
                <div className="hidden border-b border-zinc-800/50 bg-zinc-800/20 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-600 lg:flex">
                  <div className="w-7 shrink-0" />
                  <div className="min-w-[160px] flex-1">Key</div>
                  {selectedEnvs.map((env) => (
                    <div
                      key={env}
                      className={`flex flex-1 min-w-[180px] items-center justify-between gap-2 ${ENV_META[env].text}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${ENV_META[env].dot}`}
                        />
                        {env}
                      </span>
                      <button
                        onClick={() => copyColumn(env)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                        title={`Reveal & copy all ${env} values as a .env block`}
                      >
                        <Copy className="h-3 w-3" />
                        copy column
                      </button>
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
                          onCopyForSync={copyForSync}
                          contentMatch={contentMatchKeys.has(row.key)}
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

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-200 shadow-xl"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sort chip ──────────────────────────────────────────────────────

function SortChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {icon}
      {label}
    </button>
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
  onCopyForSync,
  contentMatch,
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
  onCopyForSync: (
    sourceVal: string,
    sourceEnv: string,
    targetEnv: string,
    key: string,
    ref: string
  ) => void;
  contentMatch: boolean;
}) {
  // Apply value-aware reclassification visually.
  const effectiveStatus: DiffStatus =
    contentMatch && row.status === "changed" ? "matching" : row.status;
  const cfg = STATUS_CFG[effectiveStatus];

  // For "changed" rows, highlight envs that differ from the most-common ref.
  const diffHighlight = useMemo(() => {
    if (effectiveStatus !== "changed") return new Set<string>();
    const refCounts = new Map<string, number>();
    const envRefs = new Map<string, string>();
    for (const env of envs) {
      const ref = row.slots[env]?.vaultRef;
      if (ref) {
        refCounts.set(ref, (refCounts.get(ref) || 0) + 1);
        envRefs.set(env, ref);
      }
    }
    let baseRef = "";
    let maxCount = 0;
    for (const [ref, count] of refCounts) {
      if (count > maxCount) {
        baseRef = ref;
        maxCount = count;
      }
    }
    const highlighted = new Set<string>();
    for (const [env, ref] of envRefs) {
      if (ref !== baseRef) highlighted.add(env);
    }
    return highlighted;
  }, [row, envs, effectiveStatus]);

  // Find a "source" env for missing slots (any env where the var IS present).
  const sourceEnvForMissing = useMemo(() => {
    return envs.find((env) => row.slots[env] !== null) || null;
  }, [envs, row.slots]);

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
        <div className="flex min-w-[160px] flex-1 flex-wrap items-center gap-2">
          <code className="font-mono text-sm font-medium text-zinc-200">
            {row.key}
          </code>
          {row.isSensitive && <Lock className="h-3 w-3 text-amber-500/60" />}
          <TerminalBadge color={cfg.badge}>{effectiveStatus}</TerminalBadge>
          {contentMatch && (
            <span
              className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400"
              title="Vault refs differ but the actual decrypted values match"
            >
              <Sparkles className="h-2.5 w-2.5" />
              content match
            </span>
          )}
        </div>

        {/* Inline values per environment — full width with horizontal scroll */}
        {envs.map((env) => {
          const slot = row.slots[env];
          const meta = ENV_META[env];
          const revealed = slot ? revealedValues[slot.vaultRef] : undefined;
          const isRevealing = slot ? revealingRefs.has(slot.vaultRef) : false;
          const isDiff = diffHighlight.has(env);

          return (
            <div
              key={env}
              className={`group/cell flex min-w-[180px] flex-1 items-center gap-1 overflow-hidden rounded px-2 py-1 ${
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
              ) : revealed ? (
                <>
                  <code
                    className="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-green-400"
                    title={revealed}
                  >
                    {revealed}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy(revealed, slot.vaultRef);
                    }}
                    className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition-opacity hover:text-zinc-200 group-hover/cell:opacity-100"
                    title="Copy value"
                  >
                    {copiedRef === slot.vaultRef ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRevealRef(slot.vaultRef);
                  }}
                  className={`flex items-center gap-1 font-mono text-xs opacity-50 transition-opacity hover:opacity-100 ${meta.text}`}
                >
                  <Eye className="h-3 w-3" />
                  ••••••••
                </button>
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
        <div className="flex flex-wrap items-center gap-2">
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
          <TerminalBadge color={cfg.badge}>{effectiveStatus}</TerminalBadge>
          {contentMatch && (
            <span className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
              <Sparkles className="h-2.5 w-2.5" />
              content match
            </span>
          )}
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
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 px-2 py-1.5">
                              <XCircle className="h-3 w-3 text-red-500/60" />
                              <span className="font-mono text-xs text-red-400/60">
                                not defined in this environment
                              </span>
                            </div>
                            {sourceEnvForMissing && (
                              <SyncFromButton
                                sourceEnv={sourceEnvForMissing}
                                targetEnv={env}
                                row={row}
                                revealedValues={revealedValues}
                                revealingRefs={revealingRefs}
                                onRevealRef={onRevealRef}
                                onCopyForSync={onCopyForSync}
                                copiedRef={copiedRef}
                              />
                            )}
                          </div>
                        ) : revealed ? (
                          <div className="group/val relative">
                            <pre className="block max-h-48 overflow-auto rounded bg-zinc-800 px-2 py-1.5 font-mono text-xs text-green-400">
                              <code className="break-all whitespace-pre-wrap">
                                {revealed}
                              </code>
                            </pre>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCopy(revealed, slot.vaultRef);
                              }}
                              className="absolute right-1 top-1 rounded bg-zinc-900/80 p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-100 group-hover/val:opacity-100"
                              title="Copy"
                            >
                              {copiedRef === slot.vaultRef ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <div className="mt-1 font-mono text-[10px] text-zinc-600">
                              {revealed.length} chars
                            </div>
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

// ─── Sync-from button (for missing slots) ───────────────────────────

function SyncFromButton({
  sourceEnv,
  targetEnv,
  row,
  revealedValues,
  revealingRefs,
  onRevealRef,
  onCopyForSync,
  copiedRef,
}: {
  sourceEnv: string;
  targetEnv: string;
  row: DiffRow;
  revealedValues: Record<string, string>;
  revealingRefs: Set<string>;
  onRevealRef: (ref: string) => void;
  onCopyForSync: (
    sourceVal: string,
    sourceEnv: string,
    targetEnv: string,
    key: string,
    ref: string
  ) => void;
  copiedRef: string | null;
}) {
  const sourceSlot = row.slots[sourceEnv];
  if (!sourceSlot) return null;
  const sourceVal = revealedValues[sourceSlot.vaultRef];
  const isRevealing = revealingRefs.has(sourceSlot.vaultRef);
  const copyKey = `${sourceSlot.vaultRef}::${targetEnv}`;
  const justCopied = copiedRef === copyKey;

  if (!sourceVal) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRevealRef(sourceSlot.vaultRef);
        }}
        disabled={isRevealing}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-zinc-700/50 bg-zinc-900 px-2 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
        title={`Reveal ${sourceEnv} value to copy it`}
      >
        {isRevealing ? (
          <span className="h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300" />
        ) : (
          <Eye className="h-3 w-3" />
        )}
        Reveal {sourceEnv} to copy →
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onCopyForSync(
          sourceVal,
          sourceEnv,
          targetEnv,
          row.key,
          sourceSlot.vaultRef
        );
      }}
      className={`flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[11px] transition-colors ${
        justCopied
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-zinc-700/50 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
      }`}
      title={`Copy ${sourceEnv} value of ${row.key} so you can paste it into ${targetEnv}`}
    >
      {justCopied ? (
        <>
          <Check className="h-3 w-3" />
          Copied — paste in {targetEnv}
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy from {sourceEnv}
          <ArrowRight className="h-3 w-3" />
          {targetEnv}
        </>
      )}
    </button>
  );
}
