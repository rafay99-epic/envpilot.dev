import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Switch } from "@/components/ui/Switch";
import { SearchInput } from "@/components/ui/SearchInput";
import { QueryState } from "@/components/ui/QueryState";
import { useFilteredList } from "@/hooks/useFilteredList";
import { toast } from "@/components/ui/Toast";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function FeatureMatrixTab() {
  const tierDefs = useAdminQuery(
    api.features.admin.tiers.listTierDefinitions,
    {}
  );
  const featureRegistry = useAdminQuery(
    api.features.admin.featureFlags.listFeatureRegistry,
    {}
  );
  const tierFeatures = useAdminQuery(
    api.features.admin.featureFlags.listTierFeatures,
    {}
  );

  const setTierFeatureValue = useAdminMutation(
    api.features.admin.featureFlags.setTierFeatureValue
  );
  const removeTierFeatureOverride = useAdminMutation(
    api.features.admin.featureFlags.removeTierFeatureOverride
  );

  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, boolean>
  >({});
  const [matrixSearch, setMatrixSearch] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<
    string | null
  >(null);

  const tierFeatureMap: Record<string, Record<string, string>> = {};
  if (tierFeatures) {
    for (const tf of tierFeatures) {
      if (!tierFeatureMap[tf.tierName]) tierFeatureMap[tf.tierName] = {};
      tierFeatureMap[tf.tierName][tf.featureKey] = tf.value;
    }
  }

  const getOverrideValue = (
    tierName: string,
    featureKey: string
  ): string | undefined => tierFeatureMap[tierName]?.[featureKey];

  const getEffectiveValue = (
    tierName: string,
    featureKey: string,
    defaultValue: string
  ): string => getOverrideValue(tierName, featureKey) ?? defaultValue;

  const featuresByCategory: Record<
    string,
    NonNullable<typeof featureRegistry>
  > = {};
  if (featureRegistry) {
    for (const f of featureRegistry) {
      if (!featuresByCategory[f.category]) featuresByCategory[f.category] = [];
      featuresByCategory[f.category].push(f);
    }
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleMatrixChange = async (
    tierName: string,
    featureKey: string,
    value: string,
    defaultValue: string
  ) => {
    try {
      if (value === defaultValue) {
        await removeTierFeatureOverride({ tierName, featureKey });
      } else {
        await setTierFeatureValue({ tierName, featureKey, value });
      }
      toast("success", "Feature value updated");
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update feature value"
      );
    }
  };

  // Registry filtered by search — powers the "showing N of M" summary.
  const searchFiltered = useFilteredList(featureRegistry, matrixSearch, (f) => [
    f.displayName,
    f.key,
  ]);
  const filteredCount = (searchFiltered ?? []).filter(
    (f) => !activeCategoryFilter || f.category === activeCategoryFilter
  ).length;

  const allCategories = Object.keys(featuresByCategory);
  const allCollapsed =
    allCategories.length > 0 &&
    allCategories.every((c) => collapsedCategories[c]);

  return (
    <section data-wide>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          Feature Configuration Matrix
        </h2>
        {featureRegistry && featureRegistry.length > 0 && (
          <button
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const c of allCategories) next[c] = !allCollapsed;
              setCollapsedCategories(next);
            }}
            className="flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
          >
            {allCollapsed ? (
              <>
                <ChevronsUpDown className="h-3 w-3" />
                Expand All
              </>
            ) : (
              <>
                <ChevronsDownUp className="h-3 w-3" />
                Collapse All
              </>
            )}
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Configure the value of each feature per tier. Bold values are
        tier-specific overrides; gray values use the feature&apos;s default.
      </p>

      <QueryState
        data={
          featureRegistry && tierDefs && tierFeatures
            ? featureRegistry
            : undefined
        }
        empty={{
          message:
            "No features registered. Run the seed function to populate the feature registry.",
        }}
      >
        {(registry) => (
          <>
            {/* Search & Category Filters */}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={matrixSearch}
                onChange={setMatrixSearch}
                placeholder="Search features by name or key…"
                className="flex-1"
              />

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setActiveCategoryFilter(null)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activeCategoryFilter === null
                      ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/40"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  All
                </button>
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setActiveCategoryFilter(
                        activeCategoryFilter === cat ? null : cat
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      activeCategoryFilter === cat
                        ? "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-600/40"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {(matrixSearch || activeCategoryFilter) && (
              <p className="mb-2 text-[11px] text-zinc-500">
                Showing {filteredCount} of {registry.length} features
                {matrixSearch && (
                  <>
                    {" "}
                    matching &ldquo;
                    <span className="text-zinc-300">{matrixSearch}</span>
                    &rdquo;
                  </>
                )}
                {activeCategoryFilter && (
                  <>
                    {" "}
                    in{" "}
                    <span className="text-zinc-300">
                      {activeCategoryFilter}
                    </span>
                  </>
                )}
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
                    <th className="px-4 py-3 text-left font-mono text-[0.68rem] font-medium uppercase tracking-wider text-zinc-500">
                      Feature
                    </th>
                    {tierDefs!.map((td) => (
                      <th
                        key={td.name}
                        className="px-4 py-3 text-center font-mono text-[0.68rem] font-medium uppercase tracking-wider text-zinc-500"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: td.color ?? "#71717a" }}
                          />
                          {td.displayName}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(featuresByCategory)
                    .filter(
                      ([category]) =>
                        !activeCategoryFilter ||
                        category === activeCategoryFilter
                    )
                    .map(([category, features]) => {
                      const searchLower = matrixSearch.toLowerCase();
                      const filteredFeatures = matrixSearch
                        ? features.filter(
                            (f) =>
                              f.displayName
                                .toLowerCase()
                                .includes(searchLower) ||
                              f.key.toLowerCase().includes(searchLower)
                          )
                        : features;

                      if (filteredFeatures.length === 0) return null;

                      return (
                        <FeatureCategoryGroup
                          key={category}
                          category={category}
                          features={filteredFeatures}
                          totalCount={features.length}
                          tierDefs={tierDefs!}
                          collapsed={
                            !!collapsedCategories[category] && !matrixSearch
                          }
                          onToggle={() => toggleCategory(category)}
                          getOverrideValue={getOverrideValue}
                          getEffectiveValue={getEffectiveValue}
                          handleMatrixChange={handleMatrixChange}
                          searchQuery={matrixSearch}
                        />
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </QueryState>
    </section>
  );
}

function FeatureCategoryGroup({
  category,
  features,
  totalCount,
  tierDefs,
  collapsed,
  onToggle,
  getOverrideValue,
  getEffectiveValue,
  handleMatrixChange,
  searchQuery,
}: {
  category: string;
  features: Array<{
    _id: string;
    key: string;
    displayName: string;
    valueType: string;
    defaultValue: string;
    _creationTime: number;
  }>;
  totalCount: number;
  tierDefs: Array<{ name: string; color?: string; displayName: string }>;
  collapsed: boolean;
  onToggle: () => void;
  getOverrideValue: (
    tierName: string,
    featureKey: string
  ) => string | undefined;
  getEffectiveValue: (
    tierName: string,
    featureKey: string,
    defaultValue: string
  ) => string;
  handleMatrixChange: (
    tierName: string,
    featureKey: string,
    value: string,
    defaultValue: string
  ) => void;
  searchQuery: string;
}) {
  const now = Date.now();
  const searchLower = searchQuery.toLowerCase();

  return (
    <>
      {/* Category header row */}
      <tr
        className="cursor-pointer border-b border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800/30"
        onClick={onToggle}
      >
        <td colSpan={1 + tierDefs.length} className="px-4 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {category}
            <span className="font-normal text-zinc-500">
              (
              {searchQuery
                ? `${features.length}/${totalCount}`
                : features.length}
              )
            </span>
          </div>
        </td>
      </tr>
      {/* Feature rows */}
      {!collapsed &&
        features.map((feature) => {
          const isNew = now - feature._creationTime < SEVEN_DAYS_MS;

          return (
            <tr
              key={feature._id}
              className="border-b border-zinc-800/30 hover:bg-zinc-800/20"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-300">
                    {searchQuery
                      ? highlightMatch(feature.displayName, searchLower)
                      : feature.displayName}
                  </span>
                  {isNew && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-blue-400 ring-1 ring-blue-500/30">
                      New
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {searchQuery
                    ? highlightMatch(feature.key, searchLower)
                    : feature.key}{" "}
                  <span className="text-zinc-600">({feature.valueType})</span>
                </div>
              </td>
              {tierDefs.map((td) => {
                const override = getOverrideValue(td.name, feature.key);
                const effective = getEffectiveValue(
                  td.name,
                  feature.key,
                  feature.defaultValue
                );
                const hasOverride = override !== undefined;

                return (
                  <td key={td.name} className="px-4 py-2.5 text-center">
                    {feature.valueType === "boolean" ? (
                      <BooleanCell
                        value={effective === "true"}
                        hasOverride={hasOverride}
                        featureKey={feature.key}
                        tierLabel={td.displayName}
                        onChange={(val) =>
                          handleMatrixChange(
                            td.name,
                            feature.key,
                            val ? "true" : "false",
                            feature.defaultValue
                          )
                        }
                      />
                    ) : (
                      <NumericCell
                        value={effective}
                        hasOverride={hasOverride}
                        onChange={(val) =>
                          handleMatrixChange(
                            td.name,
                            feature.key,
                            val,
                            feature.defaultValue
                          )
                        }
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="rounded bg-emerald-500/20 text-emerald-300">
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}

// Confirm before applying (tier-gate toggles affect production billing gates),
// then apply; disabled while the mutation is in flight.
function BooleanCell({
  value,
  hasOverride,
  featureKey,
  tierLabel,
  onChange,
}: {
  value: boolean;
  hasOverride: boolean;
  featureKey: string;
  tierLabel: string;
  onChange: (val: boolean) => void | Promise<void>;
}) {
  const { confirm } = useConfirmStore();
  const [saving, setSaving] = useState(false);

  return (
    <div
      className={`flex items-center justify-center rounded-full p-0.5 ${
        hasOverride ? "ring-1 ring-emerald-600/40" : ""
      }`}
    >
      <Switch
        checked={value}
        disabled={saving}
        size="sm"
        onChange={async (val) => {
          const ok = await confirm({
            title: "Change Feature Value",
            message: `Set "${featureKey}" to ${
              val ? "enabled" : "disabled"
            } for the ${tierLabel} tier?`,
            confirmLabel: val ? "Enable" : "Disable",
            variant: "warning",
          });
          if (!ok) return;
          setSaving(true);
          try {
            await onChange(val);
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

// Fire-and-forget numeric override: apply on blur/Enter, `∞` = unlimited.
function NumericCell({
  value,
  hasOverride,
  onChange,
}: {
  value: string;
  hasOverride: boolean;
  onChange: (val: string) => void | Promise<void>;
}) {
  const isUnlimited = value === "null";
  const [draft, setDraft] = useState(isUnlimited ? "" : value);
  const [unlimited, setUnlimited] = useState(isUnlimited);
  const [saving, setSaving] = useState(false);
  const prevServer = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync the local buffer when the server value changes underneath us, but
  // never while a save is in flight (don't clobber the optimistic edit). The
  // `saving` dep re-runs this once the save settles, so a value that changed
  // mid-save is not silently dropped — prevServer only advances on an actual
  // resync, so the missed change is still detected afterwards.
  useEffect(() => {
    if (saving) return;
    if (prevServer.current === value) return;
    prevServer.current = value;
    setDraft(value === "null" ? "" : value);
    setUnlimited(value === "null");
  }, [value, saving]);

  const save = async (next: string) => {
    if (next === value) return;
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      setSaving(false);
    }
  };

  const commitInput = () => {
    if (unlimited) return save("null");
    const trimmed = draft.trim();
    if (trimmed === "") return save("null");
    const n = parseInt(trimmed, 10);
    if (isNaN(n) || n < 0) return; // invalid — leave server value untouched
    return save(trimmed);
  };

  const toggleUnlimited = (checked: boolean) => {
    setUnlimited(checked);
    if (checked) {
      // Going TO unlimited commits immediately.
      setDraft("");
      save("null");
    } else {
      // Coming OFF unlimited only opens the cell for editing — no save until
      // blur/Enter (Escape reverts back to unlimited).
      const restored = isUnlimited ? "0" : value;
      setDraft(restored);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={unlimited ? "" : draft}
        placeholder="∞"
        disabled={saving}
        aria-label="Feature limit"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || v === "∞") {
            setDraft("");
            setUnlimited(true);
          } else if (/^\d*$/.test(v)) {
            setDraft(v);
            setUnlimited(false);
          }
        }}
        onBlur={commitInput}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(isUnlimited ? "" : value);
            setUnlimited(isUnlimited);
          }
        }}
        className={`w-16 rounded border px-2 py-1 text-center text-xs transition-all ${
          hasOverride
            ? "border-emerald-600/50 bg-zinc-800 font-semibold text-zinc-100"
            : "border-zinc-700 bg-zinc-900 text-zinc-400"
        } focus:border-emerald-500 focus:outline-none disabled:opacity-50`}
      />
      <label className="flex items-center gap-0.5 text-[10px] text-zinc-500">
        <input
          type="checkbox"
          checked={unlimited}
          disabled={saving}
          aria-label="Unlimited"
          onChange={(e) => toggleUnlimited(e.target.checked)}
          className="h-3 w-3 rounded border-zinc-600 bg-zinc-800"
        />
        ∞
      </label>
    </div>
  );
}
