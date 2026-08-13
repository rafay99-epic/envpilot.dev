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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-line bg-white py-2 pl-10 pr-4 text-sm text-ink-inverse placeholder-ink-muted focus:border-line-strong focus:outline-none focus:ring-1 focus:ring-line-strong border-line bg-surface-raised text-ink placeholder-ink-subtle"
        />
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            selectedCategory === "all"
              ? "bg-surface text-white bg-surface-raised text-ink-inverse"
              : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
          }`}
        >
          All
          <span className="text-ink-subtle">{categoryCounts.all}</span>
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
                  ? "bg-surface text-white bg-surface-raised text-ink-inverse"
                  : "bg-surface-raised text-ink-faint hover:bg-surface-hover text-ink-muted hover:bg-surface-hover"
              }`}
            >
              {IconComponent && <IconComponent className="h-3 w-3" />}
              {label}
              <span className="text-ink-subtle">{categoryCounts[cat]}</span>
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
            ? "border-line bg-surface-raised border-line bg-surface-raised"
            : "border-dashed border-line hover:border-line-strong"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-hover">
          {selectedTemplateId === null ? (
            <Check className="h-4 w-4 text-ink" />
          ) : (
            <Plus className="h-4 w-4 text-ink-muted" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Start from Scratch</p>
          <p className="text-xs text-ink-muted">
            Empty project, add variables manually
          </p>
        </div>
      </button>

      {/* Popular Templates Row */}
      {showPopular && popularTemplates.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-ink-muted" />
            <span className="text-xs font-medium text-ink-muted">Popular</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {popularTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelectTemplate(template)}
                className={`flex min-w-[180px] shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
                  selectedTemplateId === template.id
                    ? "border-line bg-surface-raised border-line bg-surface-raised/80"
                    : "border-line bg-white hover:border-line bg-surface hover:border-line-strong"
                }`}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: template.color + "15" }}
                >
                  <FrameworkLogo projectType={template.projectType} size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">
                    {template.name}
                  </p>
                  <p className="text-xs text-ink-subtle">
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
        <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center border-line">
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
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
        isSelected
          ? "border-line bg-surface-raised border-line bg-surface-raised/80"
          : "border-transparent hover:bg-surface-hover/50"
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
          <p className="truncate text-sm font-medium text-ink">
            {template.name}
          </p>
          {template.version && (
            <span className="shrink-0 rounded bg-surface-raised px-1 py-0.5 text-[10px] font-medium text-ink-subtle bg-surface-raised text-ink-muted">
              {template.version}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-ink-muted">
          {template.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle bg-surface-raised text-ink-muted">
          {template.variables.length}
        </span>
        {sensitiveCount > 0 && <Lock className="h-3 w-3 text-ink-subtle" />}
        {isSelected && <Check className="h-4 w-4 text-ink" />}
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
    <div className="rounded-lg border border-line bg-white p-3 border-line bg-surface">
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
