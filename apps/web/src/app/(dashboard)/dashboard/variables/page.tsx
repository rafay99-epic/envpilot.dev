"use client";

import { useState } from "react";
import {
  useVariables,
  useProjects,
  useConvexUser,
  usePagination,
} from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import type { Id } from "@convex/_generated/dataModel";
import {
  TerminalWindow,
  TerminalInput,
  TerminalSelect,
  TerminalButton,
  TerminalButtonLink,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { staggeredRow } from "@/components/dashboard/animated-list";
import {
  VariableEditModal,
  type VariableFormData,
} from "@/components/variables";
import { ConfirmDialog } from "@/components/ui";
import { motion } from "framer-motion";
import {
  Plus,
  Search,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Trash2,
  Check,
  Loader2,
} from "lucide-react";

interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  updatedAt: number;
  projectId: Id<"projects">;
  projectName?: string;
  vaultRef?: string;
  version: number;
}

export default function VariablesPage() {
  const { hasPermission, organization, user } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { convexUserId } = useConvexUser(user?.id);
  const { variables, isLoading } = useVariables(activeOrganizationId);
  const { projects } = useProjects(activeOrganizationId, convexUserId);
  const canCreateVariable = hasPermission(PERMISSIONS.VARIABLE_CREATE);
  const canUpdateVariable = hasPermission(PERMISSIONS.VARIABLE_UPDATE);
  const canDeleteVariable = hasPermission(PERMISSIONS.VARIABLE_DELETE);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");

  // Modal states
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [deletingVariable, setDeletingVariable] = useState<Variable | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reveal value state
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set());

  const environments = Array.from(
    new Set((variables as Variable[]).flatMap((v) => v.environments))
  ).sort();

  const filteredVariables = (variables as Variable[]).filter((variable) => {
    const matchesSearch =
      searchQuery === "" ||
      variable.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (variable.description
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase()) ??
        false);

    const matchesProject =
      selectedProject === "all" || variable.projectId === selectedProject;

    const matchesEnvironment =
      selectedEnvironment === "all" ||
      variable.environments.includes(selectedEnvironment);

    return matchesSearch && matchesProject && matchesEnvironment;
  });

  const pagination = usePagination(filteredVariables, { pageSize: 15 });

  const handleRevealValue = async (variable: Variable) => {
    if (revealedValues[variable._id]) return;
    if (!variable.vaultRef || !organization?.id) return;

    setRevealingIds((prev) => new Set(prev).add(variable._id));
    try {
      const res = await fetch(
        `/api/vault?vaultRef=${encodeURIComponent(variable.vaultRef)}&organizationId=${encodeURIComponent(organization.id)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read secret");
      setRevealedValues((prev) => ({
        ...prev,
        [variable._id]: data.data.value,
      }));
    } catch {
      setError("Failed to reveal variable value.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setRevealingIds((prev) => {
        const next = new Set(prev);
        next.delete(variable._id);
        return next;
      });
    }
  };

  const handleUpdateVariable = async (
    variableId: Id<"environmentVariables">,
    data: VariableFormData
  ) => {
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(`/api/variables/${variableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: data.value || undefined,
          description: data.description || undefined,
          environments: data.environments,
          isSensitive: data.isSensitive,
          changeReason: "Updated via dashboard",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to update variable");
      }

      setNotice("Variable updated successfully.");
      setTimeout(() => setNotice(null), 3000);
      // Clear cached revealed value since it may have changed
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[variableId];
        return next;
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update variable";
      setError(message);
      throw err;
    }
  };

  const handleDeleteVariable = async () => {
    if (!deletingVariable) return;

    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/variables/${deletingVariable._id}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete variable");
      }

      setDeletingVariable(null);
      setNotice("Variable deleted successfully.");
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete variable";
      setError(message);
    }
  };

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> envpilot variable list
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Select or create an organization to manage variables.
        </p>
        <TerminalButtonLink href="/organizations" className="mt-6">
          Manage Organizations
        </TerminalButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">
            Environment Variables
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your encrypted secrets and configuration
          </p>
        </div>
        {canCreateVariable && (
          <TerminalButton>
            <Plus className="h-4 w-4" />
            Add Variable
          </TerminalButton>
        )}
      </div>

      {/* Notices */}
      {notice && (
        <div className="rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-3">
          <p className="text-sm text-green-400">{notice}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <TerminalInput
            type="text"
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <TerminalSelect
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="all">All Projects</option>
          {projects.map((project) => (
            <option key={project._id} value={project._id}>
              {project.name}
            </option>
          ))}
        </TerminalSelect>
        <TerminalSelect
          value={selectedEnvironment}
          onChange={(e) => setSelectedEnvironment(e.target.value)}
        >
          <option value="all">All Environments</option>
          {environments.map((env) => (
            <option key={env} value={env}>
              {env}
            </option>
          ))}
        </TerminalSelect>
      </div>

      {/* Variables List */}
      {isLoading ? (
        <TerminalLoading />
      ) : filteredVariables.length === 0 ? (
        <TerminalWindow title="variables">
          <TerminalEmptyState
            command="envpilot variable list"
            message={
              variables.length > 0
                ? "No matching variables. Try adjusting your search or filters."
                : "No variables yet. Add your first environment variable to get started."
            }
            action={
              !variables.length && canCreateVariable
                ? { label: "Add Variable" }
                : undefined
            }
          />
        </TerminalWindow>
      ) : (
        <TerminalWindow title=".env">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700/50">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Key
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Environments
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Updated
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {pagination.pageItems.map((variable, i) => (
                  <VariableRow
                    key={variable._id}
                    variable={variable}
                    index={i}
                    revealedValue={revealedValues[variable._id] ?? null}
                    isRevealing={revealingIds.has(variable._id)}
                    onReveal={() => handleRevealValue(variable)}
                    onEdit={
                      canUpdateVariable
                        ? () => setEditingVariable(variable)
                        : undefined
                    }
                    onDelete={
                      canDeleteVariable
                        ? () => setDeletingVariable(variable)
                        : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
            onGoToPage={pagination.goToPage}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            totalItems={pagination.totalItems}
          />
        </TerminalWindow>
      )}

      {/* Edit Modal */}
      <VariableEditModal
        isOpen={!!editingVariable}
        onClose={() => setEditingVariable(null)}
        variable={editingVariable}
        onSave={handleUpdateVariable}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingVariable}
        onClose={() => setDeletingVariable(null)}
        onConfirm={handleDeleteVariable}
        title="Delete Variable"
        message={`Are you sure you want to delete "${deletingVariable?.key}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

function VariableRow({
  variable,
  index = 0,
  revealedValue,
  isRevealing,
  onReveal,
  onEdit,
  onDelete,
}: {
  variable: Variable;
  index?: number;
  revealedValue: string | null;
  isRevealing: boolean;
  onReveal: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [isValueVisible, setIsValueVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleToggleReveal = () => {
    if (!revealedValue && !isRevealing) {
      onReveal();
      setIsValueVisible(true);
    } else {
      setIsValueVisible(!isValueVisible);
    }
  };

  const handleCopy = async () => {
    if (!revealedValue) return;
    try {
      await navigator.clipboard.writeText(revealedValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <>
      <motion.tr
        className="transition-colors hover:bg-green-500/5"
        {...staggeredRow(index)}
      >
        <td className="whitespace-nowrap px-5 py-3">
          <div className="flex items-center gap-2">
            {variable.isSensitive && (
              <Lock className="h-3.5 w-3.5 text-amber-500" />
            )}
            <code className="font-mono text-sm text-amber-400">
              {variable.key}
            </code>
          </div>
          {variable.description && (
            <p className="mt-0.5 text-xs text-zinc-600">
              {variable.description}
            </p>
          )}
          {isValueVisible && revealedValue && (
            <div className="mt-1 rounded bg-zinc-800 px-2 py-1">
              <code className="break-all font-mono text-xs text-green-400">
                {revealedValue}
              </code>
            </div>
          )}
        </td>
        <td className="whitespace-nowrap px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {variable.environments.map((env) => (
              <TerminalBadge key={env} color="green">
                {env}
              </TerminalBadge>
            ))}
          </div>
        </td>
        <td className="whitespace-nowrap px-5 py-3 text-sm text-zinc-500">
          {new Date(variable.updatedAt).toLocaleDateString()}
        </td>
        <td className="whitespace-nowrap px-5 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={handleToggleReveal}
              disabled={isRevealing}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400 disabled:opacity-50"
              title={
                isValueVisible && revealedValue ? "Hide value" : "Reveal value"
              }
            >
              {isRevealing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isValueVisible && revealedValue ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={handleCopy}
              disabled={!revealedValue}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400 disabled:opacity-30"
              title={copied ? "Copied!" : "Copy value"}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
                title="Edit variable"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                title="Delete variable"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      </motion.tr>
    </>
  );
}
