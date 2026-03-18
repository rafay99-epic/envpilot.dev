"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type EnvironmentTemplate,
  type TemplateCategory,
} from "@/constants/templates";
import { FrameworkLogo } from "@/components/ui";
import {
  Search,
  Lock,
  Asterisk,
  Plus,
  TrendingUp,
  Layout,
  Server,
  Layers,
  Smartphone,
  Database,
  Container,
  BarChart3,
  Check,
} from "lucide-react";

/**
 * Lucide icon component map for category pill icons
 */
const CATEGORY_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  "trending-up": TrendingUp,
  layout: Layout,
  server: Server,
  layers: Layers,
  smartphone: Smartphone,
  database: Database,
  container: Container,
  "bar-chart-3": BarChart3,
};

interface TemplateSelectorProps {
  /** string = template ID selected, null = "Start from Scratch", undefined = nothing selected yet */
  selectedTemplateId: string | null | undefined;
  onSelectTemplate: (template: EnvironmentTemplate | null) => void;
}

export function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
}: TemplateSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    TemplateCategory | "all"
  >("all");

  const popularTemplates = useMemo(() => {
    return BUILT_IN_TEMPLATES.filter((t) => t.isPopular);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: BUILT_IN_TEMPLATES.length };
    for (const cat of Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]) {
      counts[cat] = BUILT_IN_TEMPLATES.filter((t) => t.category === cat).length;
    }
    return counts;
  }, []);

  const filteredTemplates = useMemo(() => {
    let templates = BUILT_IN_TEMPLATES;

    if (selectedCategory !== "all") {
      templates = templates.filter((t) => t.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return templates;
  }, [searchQuery, selectedCategory]);

  const showPopular = selectedCategory === "all" && !searchQuery;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            selectedCategory === "all"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          All
          <span className="text-zinc-400 dark:text-zinc-500">
            {categoryCounts.all}
          </span>
        </button>
        {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => {
          const { label, icon } = TEMPLATE_CATEGORIES[cat];
          const IconComponent = CATEGORY_ICON_MAP[icon];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {IconComponent && <IconComponent className="h-3 w-3" />}
              {label}
              <span className="text-zinc-400 dark:text-zinc-500">
                {categoryCounts[cat]}
              </span>
            </button>
          );
        })}
      </div>

      {/* "Start from Scratch" row -- always visible at top */}
      <button
        type="button"
        onClick={() => onSelectTemplate(null)}
        className={`flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
          selectedTemplateId === null
            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
            : "border-dashed border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-700">
          {selectedTemplateId === null ? (
            <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
          ) : (
            <Plus className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Start from Scratch
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Empty project, add variables manually
          </p>
        </div>
      </button>

      {/* Popular Templates Row */}
      {showPopular && popularTemplates.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Popular
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {popularTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(template)}
                className={`flex min-w-[180px] shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                  selectedTemplateId === template.id
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/80"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700/80 dark:bg-zinc-900 dark:hover:border-zinc-600"
                }`}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: template.color + "15" }}
                >
                  <FrameworkLogo projectType={template.projectType} size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {template.name}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {template.variables.length} vars
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template List -- compact single-column list, no expand */}
      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {filteredTemplates.map((template, i) => (
            <motion.div
              key={template.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ delay: i * 0.015, duration: 0.15 }}
            >
              <TemplateRow
                template={template}
                isSelected={selectedTemplateId === template.id}
                onSelect={() => onSelectTemplate(template)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* No Results */}
      {filteredTemplates.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No templates found
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
            }}
            className="mt-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Compact single-row template item -- no expand/collapse, just click to select
 */
function TemplateRow({
  template,
  isSelected,
  onSelect,
}: {
  template: EnvironmentTemplate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const requiredCount = template.variables.filter((v) => v.isRequired).length;
  const sensitiveCount = template.variables.filter((v) => v.isSensitive).length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
        isSelected
          ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/80"
          : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: template.color + "15" }}
      >
        <FrameworkLogo projectType={template.projectType} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {template.name}
          </p>
          {template.version && (
            <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {template.version}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {template.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {template.variables.length}
        </span>
        {sensitiveCount > 0 && (
          <Lock className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
        )}
        {isSelected && (
          <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
        )}
      </div>
    </button>
  );
}

/**
 * Variables preview panel -- shown in the details sidebar when a template is selected
 */
export function TemplateVariablesPreview({
  template,
}: {
  template: EnvironmentTemplate;
}) {
  const requiredCount = template.variables.filter((v) => v.isRequired).length;
  const sensitiveCount = template.variables.filter((v) => v.isSensitive).length;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ backgroundColor: template.color + "15" }}
          >
            <FrameworkLogo projectType={template.projectType} size={14} />
          </div>
          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
            {template.name}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>{template.variables.length} vars</span>
          {requiredCount > 0 && (
            <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
              <Asterisk className="h-2.5 w-2.5" />
              {requiredCount}
            </span>
          )}
          {sensitiveCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Lock className="h-2.5 w-2.5" />
              {sensitiveCount}
            </span>
          )}
        </div>
      </div>
      <div className="max-h-[200px] space-y-0.5 overflow-y-auto">
        {template.variables.map((v) => (
          <div key={v.key} className="flex items-center gap-1.5 py-0.5">
            <code className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              {v.key}
            </code>
            {v.isRequired && (
              <Asterisk className="h-2.5 w-2.5 shrink-0 text-amber-500" />
            )}
            {v.isSensitive && (
              <Lock className="h-2.5 w-2.5 shrink-0 text-zinc-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
