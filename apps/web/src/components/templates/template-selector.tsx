"use client";

import { useState, useMemo } from "react";
import {
  BUILT_IN_TEMPLATES,
  PROJECT_TYPES,
  type EnvironmentTemplate,
  type ProjectType,
  type TemplateVariable,
} from "@/constants/templates";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Lock,
  Asterisk,
  Wrench,
} from "lucide-react";

/**
 * Maps project types to SVGL CDN URLs for real product logos.
 * Some logos (like Rails) use inline SVG because the CDN path is unreliable.
 * @see https://svgl.app
 */
const FRAMEWORK_LOGOS: Record<ProjectType, string> = {
  nextjs: "https://svgl.app/library/nextjs_icon_dark.svg",
  express: "https://svgl.app/library/expressjs_dark.svg",
  "react-native": "https://svgl.app/library/react_dark.svg",
  react: "https://svgl.app/library/react_dark.svg",
  nodejs: "https://svgl.app/library/nodejs.svg",
  django: "https://svgl.app/library/django.svg",
  flask: "https://svgl.app/library/flask_dark.svg",
  rails: "", // uses inline SVG below
  laravel: "https://svgl.app/library/laravel.svg",
  fastapi: "https://svgl.app/library/fastapi.svg",
  custom: "",
};

function RailsLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 255"
      width={size}
      height={size}
    >
      <defs>
        <linearGradient x1="84.8%" y1="111.4%" x2="58.3%" y2="64.6%" id="ra">
          <stop stopColor="#FB7655" offset="0%" />
          <stop stopColor="#E42B1E" offset="41%" />
          <stop stopColor="#900" offset="99%" />
        </linearGradient>
        <linearGradient x1="116.7%" y1="60.9%" x2="1.7%" y2="19.3%" id="rb">
          <stop stopColor="#871101" offset="0%" />
          <stop stopColor="#911209" offset="100%" />
        </linearGradient>
        <linearGradient x1="75.8%" y1="219.3%" x2="39%" y2="7.8%" id="rc">
          <stop stopColor="#871101" offset="0%" />
          <stop stopColor="#911209" offset="100%" />
        </linearGradient>
        <linearGradient x1="50%" y1="7.2%" x2="66.5%" y2="79.1%" id="rd">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#E57252" offset="23%" />
          <stop stopColor="#DE3B20" offset="46%" />
          <stop stopColor="#A60003" offset="100%" />
        </linearGradient>
        <linearGradient x1="46.2%" y1="16.3%" x2="49.9%" y2="83%" id="re">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#E4714E" offset="23%" />
          <stop stopColor="#BE1A0D" offset="56%" />
          <stop stopColor="#A80D00" offset="100%" />
        </linearGradient>
        <linearGradient x1="37%" y1="15.6%" x2="49.5%" y2="92.5%" id="rf">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#E46342" offset="18%" />
          <stop stopColor="#C82410" offset="40%" />
          <stop stopColor="#A80D00" offset="100%" />
        </linearGradient>
        <linearGradient x1="13.6%" y1="58.3%" x2="85.8%" y2="-46.7%" id="rg">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#C81F11" offset="54%" />
          <stop stopColor="#BF0905" offset="100%" />
        </linearGradient>
        <linearGradient x1="27.6%" y1="21.1%" x2="50.7%" y2="79.1%" id="rh">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#DE4024" offset="31%" />
          <stop stopColor="#BF190B" offset="100%" />
        </linearGradient>
        <linearGradient x1="-20.7%" y1="122.3%" x2="104.2%" y2="-6.3%" id="ri">
          <stop stopColor="#BD0012" offset="0%" />
          <stop stopColor="#FFF" offset="7%" />
          <stop stopColor="#FFF" offset="17%" />
          <stop stopColor="#C82F1C" offset="27%" />
          <stop stopColor="#820C01" offset="33%" />
          <stop stopColor="#A31601" offset="46%" />
          <stop stopColor="#B31301" offset="72%" />
          <stop stopColor="#E82609" offset="100%" />
        </linearGradient>
        <linearGradient x1="58.8%" y1="65.2%" x2="12%" y2="50.1%" id="rj">
          <stop stopColor="#8C0C01" offset="0%" />
          <stop stopColor="#990C00" offset="54%" />
          <stop stopColor="#A80D0E" offset="100%" />
        </linearGradient>
        <linearGradient x1="79.3%" y1="62.8%" x2="23.1%" y2="17.9%" id="rk">
          <stop stopColor="#7E110B" offset="0%" />
          <stop stopColor="#9E0C00" offset="100%" />
        </linearGradient>
        <linearGradient x1="92.9%" y1="74.1%" x2="59.8%" y2="39.7%" id="rl">
          <stop stopColor="#79130D" offset="0%" />
          <stop stopColor="#9E120B" offset="100%" />
        </linearGradient>
        <linearGradient x1="56.6%" y1="101.7%" x2="3.1%" y2="12%" id="ro">
          <stop stopColor="#8B2114" offset="0%" />
          <stop stopColor="#9E100A" offset="43%" />
          <stop stopColor="#B3100C" offset="100%" />
        </linearGradient>
        <linearGradient x1="30.9%" y1="35.6%" x2="92.5%" y2="100.7%" id="rp">
          <stop stopColor="#B31000" offset="0%" />
          <stop stopColor="#910F08" offset="44%" />
          <stop stopColor="#791C12" offset="100%" />
        </linearGradient>
        <radialGradient cx="32%" cy="40.2%" r="69.6%" id="rm">
          <stop stopColor="#A80D00" offset="0%" />
          <stop stopColor="#7E0E08" offset="100%" />
        </radialGradient>
        <radialGradient cx="13.5%" cy="40.9%" r="88.4%" id="rn">
          <stop stopColor="#A30C00" offset="0%" />
          <stop stopColor="#800E08" offset="100%" />
        </radialGradient>
      </defs>
      <path
        d="M197.5 167.8 51.9 254.2l188.5-12.8 14.5-190-57.4 116.4Z"
        fill="url(#ra)"
      />
      <path d="m240.7 241.3-16.2-111.8-44.1 58.2 60.3 53.6Z" fill="url(#rb)" />
      <path d="m240.9 241.3-118.7-9.4-69.6 22 188.3-12.6Z" fill="url(#rc)" />
      <path d="m52.7 254 29.7-97.1-65.2 13.9L52.7 254Z" fill="url(#rd)" />
      <path d="m180.4 188-27.4-106.7-78 73.2L180.3 188Z" fill="url(#re)" />
      <path d="m248.7 82.7-73.8-60.2-20.5 66.4 94.3-6.2Z" fill="url(#rf)" />
      <path d="m214.2 1-43.4 24L143.4.7l70.8.3Z" fill="url(#rg)" />
      <path d="m0 203.4 18.2-33.2-14.7-39.5L0 203.4Z" fill="url(#rh)" />
      <path
        d="m2.5 129.5 14.8 42L81.6 157 155 88.8 175.7 23 143 0 87.6 20.8C70.1 37 36.3 69 35 69.8c-1.2.6-22.4 40.6-32.5 59.7Z"
        fill="#FFF"
      />
      <path
        d="M54.4 54c37.9-37.4 86.7-59.6 105.4-40.7 18.8 18.9-1 64.8-39 102.3-37.8 37.5-86 61-104.7 42-18.8-18.8.5-66 38.3-103.5Z"
        fill="url(#ri)"
      />
      <path
        d="m52.7 254 29.5-97.5 97.6 31.4c-35.3 33.1-74.6 61-127 66Z"
        fill="url(#rj)"
      />
      <path
        d="m155 88.6 25.2 99.3c29.5-31 56-64.3 68.9-105.6l-94 6.3Z"
        fill="url(#rk)"
      />
      <path
        d="M248.8 82.8c10-30.2 12.4-73.7-35-81.8l-38.7 21.5 73.7 60.3Z"
        fill="url(#rl)"
      />
      <path
        d="M0 203c1.4 50 37.4 50.7 52.8 51.1l-35.5-82.9L0 203Z"
        fill="#9E1209"
      />
      <path
        d="m155.2 88.8 69.3 42.4c1.4.8 19.7-30.8 23.8-48.6l-93 6.2Z"
        fill="url(#rm)"
      />
      <path
        d="m82.1 156.5 39.3 75.9c23.3-12.7 41.5-28 58.1-44.5l-97.4-31.4Z"
        fill="url(#rn)"
      />
      <path
        d="m17.2 171.3-5.6 66.4c10.5 14.3 25 15.6 40.1 14.5-11-27.4-32.9-82-34.5-80.9Z"
        fill="url(#ro)"
      />
      <path
        d="m174.8 22.7 78.1 11C248.8 16 236 4.5 214.1 1l-39.3 21.7Z"
        fill="url(#rp)"
      />
    </svg>
  );
}

function FrameworkLogo({
  projectType,
  size = 24,
  className = "",
}: {
  projectType: ProjectType;
  size?: number;
  className?: string;
}) {
  if (projectType === "rails") {
    return <RailsLogo size={size} />;
  }
  if (projectType === "custom") {
    return (
      <Wrench className={className} style={{ width: size, height: size }} />
    );
  }
  const url = FRAMEWORK_LOGOS[projectType];
  return (
    <img
      src={url}
      alt={PROJECT_TYPES[projectType]?.label ?? projectType}
      width={size}
      height={size}
      className={className}
      loading="lazy"
    />
  );
}

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
    null
  );

  const filteredTemplates = useMemo(() => {
    let templates = BUILT_IN_TEMPLATES;

    if (selectedProjectType !== "all") {
      templates = templates.filter(
        (t) => t.projectType === selectedProjectType
      );
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
  }, [searchQuery, selectedProjectType]);

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
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        <select
          value={selectedProjectType}
          onChange={(e) =>
            setSelectedProjectType(e.target.value as ProjectType | "all")
          }
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="all">All Project Types</option>
          {Object.entries(PROJECT_TYPES).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* No Template Option */}
      <button
        type="button"
        onClick={() => {
          onSelectTemplate(null);
          setExpandedTemplateId(null);
        }}
        className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
          selectedTemplateId === null
            ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
            : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700">
            <Wrench className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
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
            onSelect={() => {
              onSelectTemplate(template);
              setExpandedTemplateId(template.id);
            }}
            onToggleExpand={() =>
              setExpandedTemplateId(
                expandedTemplateId === template.id ? null : template.id
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
      className={`overflow-hidden rounded-xl border transition-all ${
        isSelected
          ? "border-zinc-900 bg-zinc-50 shadow-sm dark:border-zinc-100 dark:bg-zinc-800/80"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700/80 dark:bg-zinc-900 dark:hover:border-zinc-600"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full p-4 text-left">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: template.color + "15" }}
          >
            <FrameworkLogo projectType={template.projectType} size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {template.name}
              </p>
              {template.version && (
                <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {template.version}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {template.description}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {template.variables.length} variables
              </span>
              {requiredCount > 0 && (
                <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <Asterisk className="h-3 w-3" />
                  {requiredCount} required
                </span>
              )}
              {sensitiveCount > 0 && (
                <span className="flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  <Lock className="h-3 w-3" />
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
        className="flex w-full items-center justify-center gap-1.5 border-t border-zinc-100 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Hide variables
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            Show variables
          </>
        )}
      </button>

      {/* Expanded Variables List */}
      {isExpanded && (
        <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
          <VariablesList variables={template.variables} compact />
        </div>
      )}
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
              ? "px-2 py-1.5"
              : "border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <code className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
              {variable.key}
            </code>
            {variable.isRequired && (
              <Asterisk className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            )}
            {variable.isSensitive && (
              <Lock className="h-3 w-3 text-zinc-400 dark:text-zinc-500" />
            )}
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
