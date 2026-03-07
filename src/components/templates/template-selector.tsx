"use client";

import { useState, useMemo } from "react";
import {
  BUILT_IN_TEMPLATES,
  PROJECT_TYPES,
  VARIABLE_CATEGORIES,
  type EnvironmentTemplate,
  type ProjectType,
  type TemplateVariable,
  groupVariablesByCategory,
} from "@/constants/templates";

interface TemplateSelectorProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (template: EnvironmentTemplate | null) => void;
}

export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectType, setSelectedProjectType] = useState<
    ProjectType | "all"
  >("all");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(
    null,
  );

  const filteredTemplates = useMemo(() => {
    let templates = BUILT_IN_TEMPLATES;

    // Filter by project type
    if (selectedProjectType !== "all") {
      templates = templates.filter(
        (t) => t.projectType === selectedProjectType,
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return templates;
  }, [searchQuery, selectedProjectType]);

  const selectedTemplate = selectedTemplateId
    ? BUILT_IN_TEMPLATES.find((t) => t.id === selectedTemplateId) || null
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Start from Template
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Choose a pre-configured template with common environment variables for
          your project type
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        {/* Project Type Filter */}
        <select
          value={selectedProjectType}
          onChange={(e) =>
            setSelectedProjectType(e.target.value as ProjectType | "all")
          }
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="all">All Project Types</option>
          {Object.entries(PROJECT_TYPES).map(([key, { label, icon }]) => (
            <option key={key} value={key}>
              {icon} {label}
            </option>
          ))}
        </select>
      </div>

      {/* No Template Option */}
      <button
        type="button"
        onClick={() => onSelectTemplate(null)}
        className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
          selectedTemplateId === null
            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-lg dark:bg-zinc-700">
            🔧
          </div>
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              Start from Scratch
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Create an empty project and add variables manually
            </p>
          </div>
        </div>
      </button>

      {/* Templates Grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedTemplateId === template.id}
            isExpanded={expandedTemplateId === template.id}
            onSelect={() => onSelectTemplate(template)}
            onToggleExpand={() =>
              setExpandedTemplateId(
                expandedTemplateId === template.id ? null : template.id,
              )
            }
          />
        ))}
      </div>

      {/* No Results */}
      {filteredTemplates.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No templates found matching your search
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedProjectType("all");
            }}
            className="mt-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Selected Template Preview */}
      {selectedTemplate && <TemplatePreview template={selectedTemplate} />}
    </div>
  );
}

interface TemplateCardProps {
  template: EnvironmentTemplate;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}

function TemplateCard({
  template,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
}: TemplateCardProps) {
  const requiredCount = template.variables.filter((v) => v.isRequired).length;
  const sensitiveCount = template.variables.filter((v) => v.isSensitive).length;

  return (
    <div
      className={`rounded-lg border-2 transition-all ${
        isSelected
          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full p-4 text-left">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
            style={{ backgroundColor: template.color + "20" }}
          >
            {template.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {template.name}
              </p>
              {template.version && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                  {template.version}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
              {template.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                {template.variables.length} variables
              </span>
              {requiredCount > 0 && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  {requiredCount} required
                </span>
              )}
              {sensitiveCount > 0 && (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  {sensitiveCount} sensitive
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Expand/Collapse Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className="flex w-full items-center justify-center gap-1 border-t border-zinc-200 py-2 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        {isExpanded ? (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 15l7-7 7 7"
              />
            </svg>
            Hide variables
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
            Show variables
          </>
        )}
      </button>

      {/* Expanded Variables List */}
      {isExpanded && (
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
          <VariablesList variables={template.variables} compact />
        </div>
      )}
    </div>
  );
}

interface TemplatePreviewProps {
  template: EnvironmentTemplate;
}

function TemplatePreview({ template }: TemplatePreviewProps) {
  const groupedVariables = groupVariablesByCategory(template.variables);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
            style={{ backgroundColor: template.color + "20" }}
          >
            {template.icon}
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {template.name}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {template.variables.length} environment variables will be created
            </p>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {template.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* Variables by Category */}
      <div className="space-y-4">
        {Object.entries(groupedVariables).map(([category, variables]) => {
          if (variables.length === 0) return null;
          const categoryInfo =
            VARIABLE_CATEGORIES[category as keyof typeof VARIABLE_CATEGORIES];

          return (
            <div key={category}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-base">{categoryInfo.icon}</span>
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {categoryInfo.label}
                </span>
              </div>
              <VariablesList variables={variables} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface VariablesListProps {
  variables: TemplateVariable[];
  compact?: boolean;
}

function VariablesList({ variables, compact = false }: VariablesListProps) {
  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {variables.map((variable) => (
        <div
          key={variable.key}
          className={`rounded-lg ${
            compact
              ? "p-2"
              : "border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <code className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {variable.key}
            </code>
            {variable.isRequired && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                *
              </span>
            )}
            {variable.isSensitive && <span className="text-xs">🔐</span>}
          </div>
          {!compact && (
            <>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {variable.description}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {variable.environments.map((env) => (
                  <span
                    key={env}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      env === "production"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : env === "staging"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    }`}
                  >
                    {env}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
