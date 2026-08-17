"use client";

import { useId, useState, useMemo } from "react";
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
  const searchId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    TemplateCategory | "all"
  >("all");

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

  return (
    <div>
      {/* Search. An underline rather than a filled box: it sits above a list
          of rows, and a second bordered rectangle there was one of eleven
          competing at the same weight. */}
      <div className="flex items-center gap-2.5 border-b px-4 py-2.5 border-line">
        <label htmlFor={searchId} className="sr-only">
          Search templates
        </label>
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <input
          id={searchId}
          type="text"
          placeholder={`Search ${BUILT_IN_TEMPLATES.length} templates...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border-0 bg-transparent p-0 font-mono text-xs focus:outline-none focus:ring-0 text-ink placeholder-ink-faint"
        />
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto border-b px-4 py-2.5 border-line [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
            selectedCategory === "all"
              ? "border-accent-line bg-accent-soft text-accent"
              : "border-line text-ink-faint hover:text-ink"
          }`}
        >
          all
          <span className="text-ink-faint">{categoryCounts.all}</span>
        </button>
        {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => {
          const { label, icon } = TEMPLATE_CATEGORIES[cat];
          const IconComponent = CATEGORY_ICON_MAP[icon];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
                selectedCategory === cat
                  ? "border-accent-line bg-accent-soft text-accent"
                  : "border-line text-ink-faint hover:text-ink"
              }`}
            >
              {IconComponent && <IconComponent className="h-3 w-3" />}
              {label.toLowerCase()}
              <span className="text-ink-faint">{categoryCounts[cat]}</span>
            </button>
          );
        })}
      </div>

      {/* Start from scratch, as the first row of the list rather than a
          dashed box above it. */}
      <button
        type="button"
        onClick={() => onSelectTemplate(null)}
        className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors border-line ${
          selectedTemplateId === null
            ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]"
            : "hover:bg-surface-hover"
        }`}
      >
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-surface-raised">
          {selectedTemplateId === null ? (
            <Check className="h-3.5 w-3.5 text-accent" />
          ) : (
            <Plus className="h-3.5 w-3.5 text-ink-faint" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink">
            Start from scratch
          </p>
          <p className="text-xs text-ink-subtle">
            Empty project, add variables manually
          </p>
        </div>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-faint">
          0 vars
        </span>
      </button>

      {/* Template list. Rows are flush and separated by hairlines, the same
          idiom as the variables table. */}
      <div>
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
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-ink-muted">No templates found</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
            }}
            className="mt-1.5 text-xs font-medium text-ink-faint hover:text-ink"
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
      className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors border-line ${
        isSelected
          ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]"
          : "hover:bg-surface-hover"
      }`}
    >
      <div
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded"
        style={{ backgroundColor: template.color + "15" }}
      >
        <FrameworkLogo projectType={template.projectType} size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13.5px] font-medium text-ink">
            {template.name}
          </p>
          {template.version && (
            <span className="shrink-0 font-mono text-[10px] text-ink-faint">
              {template.version}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-ink-muted">
          {template.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {sensitiveCount > 0 && <Lock className="h-3 w-3 text-ink-faint" />}
        <span className="font-mono text-[11px] text-ink-faint">
          {template.variables.length} vars
        </span>
        {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
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
    <div className="rounded-lg border p-3 border-line bg-surface">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded"
            style={{ backgroundColor: template.color + "15" }}
          >
            <FrameworkLogo projectType={template.projectType} size={14} />
          </div>
          <span className="text-xs font-medium text-ink">{template.name}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-ink-muted">
          <span>{template.variables.length} vars</span>
          {requiredCount > 0 && (
            <span className="flex items-center gap-0.5 text-warning">
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
            <code className="truncate text-[11px] font-medium text-ink-muted">
              {v.key}
            </code>
            {v.isRequired && (
              <Asterisk className="h-2.5 w-2.5 shrink-0 text-warning" />
            )}
            {v.isSensitive && (
              <Lock className="h-2.5 w-2.5 shrink-0 text-ink-muted" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
