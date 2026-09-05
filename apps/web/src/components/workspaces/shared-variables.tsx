"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import type { ScopeTarget } from "./scope-dialog";

export type SharedVariableRow = {
  _id: Id<"environmentVariables">;
  key: string;
  environments: string[];
  isSensitive: boolean;
  appliesTo: Id<"projects">[] | undefined;
  appliesToCount: number | undefined;
};

interface SharedVariablesProps {
  variables: SharedVariableRow[];
  memberCount: number;
  onAdd: () => void;
  onEdit: (variable: SharedVariableRow) => void;
  onScope: (target: ScopeTarget) => void;
  onDelete: (target: {
    variableId: Id<"environmentVariables">;
    key: string;
  }) => void;
}

/** The rows a workspace shares, each stating how many members read it. */
export function SharedVariables({
  variables,
  memberCount,
  onAdd,
  onEdit,
  onScope,
  onDelete,
}: SharedVariablesProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-mono text-sm text-ink">Shared variables</h2>
        <span className="font-mono text-xs text-ink-muted">
          {variables.length} shared with {memberCount}{" "}
          {memberCount === 1 ? "project" : "projects"}
        </span>
      </div>

      {variables.length === 0 ? (
        <div className="space-y-3 border border-line px-4 py-6">
          <p className="text-sm text-ink-muted">No shared variables yet.</p>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 border border-line px-3 py-2 font-mono text-xs text-ink-muted hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your first shared variable
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {variables.map((variable) => (
            <li
              key={variable._id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <button
                type="button"
                onClick={() => onEdit(variable)}
                className="font-mono text-sm text-ink hover:text-accent"
              >
                {variable.key}
              </button>
              <span className="flex items-center gap-4 font-mono text-xs text-ink-muted">
                <span>{variable.environments.join(" ")}</span>
                <button
                  type="button"
                  onClick={() =>
                    onScope({
                      variableId: variable._id,
                      key: variable.key,
                      appliesTo: variable.appliesTo,
                    })
                  }
                  className="underline decoration-dotted underline-offset-4 hover:text-accent"
                >
                  {variable.appliesToCount === undefined
                    ? `read by all ${memberCount}`
                    : `read by ${variable.appliesToCount} of ${memberCount}`}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onDelete({ variableId: variable._id, key: variable.key })
                  }
                  className="text-ink-muted hover:text-danger"
                  aria-label={`Delete ${variable.key}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
