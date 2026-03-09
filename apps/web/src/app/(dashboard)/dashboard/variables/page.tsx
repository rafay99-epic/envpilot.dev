"use client";

import { useState } from "react";
import { useVariables, useProjects } from "@/hooks";
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
import { Plus, Search, Lock, Eye, EyeOff, Copy, Pencil } from "lucide-react";

export default function VariablesPage() {
  const { hasPermission, organization } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { variables, isLoading } = useVariables(activeOrganizationId);
  const { projects } = useProjects(activeOrganizationId);
  const canCreateVariable = hasPermission(PERMISSIONS.VARIABLE_CREATE);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");

  const environments = Array.from(
    new Set(variables.flatMap((v) => v.environments))
  ).sort();

  const filteredVariables = variables.filter((variable) => {
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
                {filteredVariables.map((variable) => (
                  <VariableRow key={variable._id} variable={variable} />
                ))}
              </tbody>
            </table>
          </div>
        </TerminalWindow>
      )}
    </div>
  );
}

interface Variable {
  _id: string;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  updatedAt: number;
  projectId: string;
}

function VariableRow({ variable }: { variable: Variable }) {
  const [isRevealed, setIsRevealed] = useState(false);

  return (
    <tr className="transition-colors hover:bg-green-500/5">
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
          <p className="mt-0.5 text-xs text-zinc-600">{variable.description}</p>
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
            onClick={() => setIsRevealed(!isRevealed)}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
            title={isRevealed ? "Hide value" : "Reveal value"}
          >
            {isRevealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <button
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
            title="Copy value"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400"
            title="Edit variable"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
