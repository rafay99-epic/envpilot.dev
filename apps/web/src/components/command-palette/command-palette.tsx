"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { Hotkey, HotkeySequence } from "@tanstack/react-hotkeys";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "convex/react";
import { Search, Lock, X, Tag, SlidersHorizontal } from "lucide-react";
import { api as convexApi } from "@convex/_generated/api";
import { useAuthContext } from "@/components/auth";
import { useConvexUser, useGlobalSearch } from "@/hooks";
import { ENVIRONMENTS } from "@/constants/project";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { SHORTCUTS, parseBinding } from "@/hooks/useKeyboardShortcuts";
import { TagBadge } from "@/components/variables/tag-badge";
import { searchSettings } from "@/settings/settings-index";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

const ENV_FILTERS = ["all", ...ENVIRONMENTS] as const;
type EnvFilter = (typeof ENV_FILTERS)[number];

const ENV_COLORS: Record<string, string> = {
  development: "bg-info-soft text-info border-info-line",
  staging: "bg-warning-soft text-warning border-warning-line",
  production: "bg-accent-soft text-accent border-accent-line",
};

// Stable empty reference: a fresh `[]` on every render would change identity
// each pass and defeat the navItems memo below.
const NO_DOCS: never[] = [];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const { user, organization } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);
  const { searchTerm, setSearchTerm, results, isLoading } =
    useGlobalSearch(convexUserId);

  // Published documentation across every visible project. Its own query so
  // the variable search keeps its shape, but the SAME palette — one Cmd+K.
  // Debounced like the variable search: the query fans out per project, so a
  // read per keystroke is exactly the cost being avoided.
  const [docTerm, setDocTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDocTerm(searchTerm.trim()), 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const docResults =
    useQuery(
      convexApi.features.docs.queries.globalSearch,
      convexUserId && docTerm.length >= 2 ? { searchTerm: docTerm } : "skip"
    ) ?? NO_DOCS;

  // Gated on the CURRENT term, not the debounced one. `docTerm` lags 300ms,
  // so clearing the box left the previous hits in `navCount` and reachable by
  // Enter while the section itself had already stopped rendering — Enter
  // opened an invisible document. Everything below uses this, never the raw
  // query result.
  const visibleDocs = searchTerm.trim().length >= 2 ? docResults : NO_DOCS;

  // Collect unique tags from results for tag filter chips
  const availableTags = useMemo(() => {
    const tagMap = new Map<
      string,
      { _id: string; name: string; color: string }
    >();
    for (const r of results) {
      if (r.tags) {
        for (const tag of r.tags) {
          if (!tagMap.has(tag._id)) tagMap.set(tag._id, tag);
        }
      }
    }
    return Array.from(tagMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [results]);

  // Prune stale tag IDs from filter — computed inline to avoid setState-in-effect
  const availableTagIds = useMemo(
    () => new Set(availableTags.map((t) => t._id)),
    [availableTags]
  );
  const activeTagFilter = useMemo(
    () => tagFilter.filter((id) => availableTagIds.has(id)),
    [tagFilter, availableTagIds]
  );

  // Gated on the CURRENT term for the same reason `visibleDocs` is: the
  // variable query is debounced 300ms, so clearing the box left the previous
  // hits in `navCount` and reachable by Enter while the list already showed
  // the "type at least 2 characters" placeholder.
  const activeResults = searchTerm.trim().length >= 2 ? results : [];

  // Filter results by environment AND tags
  const filteredResults = activeResults.filter((r) => {
    // Environment filter
    if (
      envFilter !== "all" &&
      !r.environments?.some((e) => e.toLowerCase().includes(envFilter))
    ) {
      return false;
    }
    // Tag filter (OR logic within selected tags)
    if (activeTagFilter.length > 0) {
      if (!r.tags || !r.tags.some((t) => activeTagFilter.includes(t._id))) {
        return false;
      }
    }
    return true;
  });

  // Settings live on three routes, so "where do I turn X off" is a hunt.
  // The palette answers it; the project scope comes from the URL when the
  // user is already inside a project — except `/dashboard/projects/new`, which
  // is the create form, so its "settings" would be a dead link.
  const pathSlug = pathname?.match(/^\/dashboard\/projects\/([^/]+)/)?.[1];
  const projectSlug = pathSlug && pathSlug !== "new" ? pathSlug : null;
  const settingsHits = useMemo(
    () =>
      searchSettings(searchTerm, {
        orgSlug: organization?.slug ?? null,
        projectSlug,
      }),
    [searchTerm, organization?.slug, projectSlug]
  );

  // ONE navigable list — variables, then docs, then settings. Every row
  // carries its own nav index, so adding a group never re-opens the
  // off-by-one arithmetic this used to do by hand.
  const navItems = useMemo(
    () => [
      ...filteredResults.map((_, index) => ({
        kind: "variable" as const,
        index,
      })),
      ...visibleDocs.map((_, index) => ({ kind: "doc" as const, index })),
      ...settingsHits.map((_, index) => ({ kind: "setting" as const, index })),
    ],
    [filteredResults, visibleDocs, settingsHits]
  );
  const navCount = navItems.length;
  // ArrowUp on an empty list wraps to `navCount - 1` === -1; clamp the low end
  // too, or the next batch of results arrives with nothing highlighted and
  // Enter indexes past the start of navItems.
  const clampedIndex =
    navCount === 0 ? 0 : Math.min(Math.max(selectedIndex, 0), navCount - 1);

  function handleSearch(value: string) {
    setSearchTerm(value);
    setSelectedIndex(0);
  }

  function handleFilterChange(filter: EnvFilter) {
    setEnvFilter(filter);
    setSelectedIndex(0);
  }

  // Declared plainly, not wrapped in useCallback: React Compiler is enabled for
  // this app and memoizes it, so the listener effect below can depend on it
  // without re-subscribing every render.
  function openPalette() {
    setSearchTerm("");
    setEnvFilter("all");
    setTagFilter([]);
    setSelectedIndex(0);
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closePalette() {
    setIsOpen(false);
  }

  // Global hotkey — respects custom bindings
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const cmdPaletteKeys =
    customBindings.COMMAND_PALETTE ?? SHORTCUTS.COMMAND_PALETTE.keys;
  const cmdPaletteBinding = parseBinding(cmdPaletteKeys);

  useHotkey(
    cmdPaletteBinding.type === "single"
      ? (cmdPaletteBinding.hotkey as Hotkey)
      : ("F24" as Hotkey),
    (e) => {
      e.preventDefault();
      if (isOpen) {
        closePalette();
      } else {
        openPalette();
      }
    },
    { enabled: cmdPaletteBinding.type === "single" }
  );

  useHotkeySequence(
    cmdPaletteBinding.type === "sequence"
      ? (cmdPaletteBinding.keys as unknown as HotkeySequence)
      : (["Unidentified", "Unidentified"] as unknown as HotkeySequence),
    () => {
      if (isOpen) {
        closePalette();
      } else {
        openPalette();
      }
    },
    cmdPaletteBinding.type === "sequence"
      ? { enabled: true }
      : { enabled: false, conflictBehavior: "allow" }
  );

  // Listen for custom open event (from search trigger button)
  useEffect(() => {
    function handleOpen() {
      openPalette();
    }
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpen);
    return () =>
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpen);
  }, [openPalette]);

  // Rows tag themselves with their nav index, so headings between groups no
  // longer shift the lookup.
  useEffect(() => {
    const selected = listRef.current?.querySelector(
      `[data-nav-index="${clampedIndex}"]`
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < navCount - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : navCount - 1));
    } else if (e.key === "Enter" && navCount > 0) {
      e.preventDefault();
      const item = navItems[clampedIndex];
      if (item.kind === "variable")
        navigateToResult(filteredResults[item.index]);
      else if (item.kind === "doc") navigateToDoc(visibleDocs[item.index]);
      else navigateTo(settingsHits[item.index].href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  }

  function navigateToResult(result: (typeof filteredResults)[0]) {
    closePalette();
    router.push(`/dashboard/projects/${result.projectSlug}`);
  }

  function navigateToDoc(doc: (typeof visibleDocs)[0]) {
    closePalette();
    router.push(`/dashboard/projects/${doc.projectSlug}/docs/${doc.slug}`);
  }

  function navigateTo(href: string) {
    closePalette();
    router.push(href);
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60]" onKeyDown={handleKeyDown}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => closePalette()}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="relative mx-4 mt-[15vh] sm:mx-auto sm:max-w-2xl"
          >
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
              {/* Search Input */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-ink-subtle" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search variables across all projects..."
                  className="flex-1 bg-transparent text-sm text-ink placeholder-ink-subtle outline-none"
                />
                <kbd className="hidden shrink-0 rounded border border-line bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle sm:inline-block">
                  ESC
                </kbd>
                <button
                  onClick={() => closePalette()}
                  className="rounded p-0.5 text-ink-subtle hover:text-ink-muted sm:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Environment Filter Chips */}
              <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
                {ENV_FILTERS.map((env) => (
                  <button
                    key={env}
                    onClick={() => handleFilterChange(env)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                      envFilter === env
                        ? "bg-accent-soft text-accent border border-accent-line"
                        : "text-ink-subtle hover:text-ink-muted border border-line hover:border-line-strong"
                    }`}
                  >
                    {env}
                  </button>
                ))}
                {/* Tag filter chips */}
                {availableTags.length > 0 && (
                  <>
                    <span className="mx-1 self-center text-ink-faint">|</span>
                    {availableTags.map((tag) => {
                      const isSelected = tagFilter.includes(tag._id);
                      return (
                        <button
                          key={tag._id}
                          onClick={() => {
                            setTagFilter((prev) =>
                              isSelected
                                ? prev.filter((id) => id !== tag._id)
                                : [...prev, tag._id]
                            );
                            setSelectedIndex(0);
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                            isSelected
                              ? "text-white"
                              : "text-ink-subtle hover:text-ink-muted border-line hover:border-line-strong"
                          }`}
                          style={
                            isSelected
                              ? {
                                  backgroundColor: tag.color,
                                  borderColor: tag.color,
                                }
                              : undefined
                          }
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag.name}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Results */}
              <div
                ref={listRef}
                className="max-h-[50vh] overflow-y-auto sm:max-h-[400px]"
              >
                {searchTerm.length < 2 ? (
                  <div className="px-4 py-8 text-center text-sm text-ink-subtle">
                    Type at least 2 characters to search...
                  </div>
                ) : isLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-ink-subtle">
                    <span className="inline-block animate-pulse">
                      Searching...
                    </span>
                  </div>
                ) : navCount === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-ink-subtle">
                    Nothing found for &ldquo;{searchTerm}&rdquo;
                  </div>
                ) : (
                  filteredResults.map((result, index) => (
                    <button
                      key={result._id}
                      data-nav-index={index}
                      onClick={() => navigateToResult(result)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                        index === clampedIndex
                          ? "bg-accent-soft"
                          : "hover:bg-surface-hover/50"
                      }`}
                    >
                      {/* Project color dot */}
                      <div
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: result.projectColor || "#71717a",
                        }}
                      />

                      <div className="min-w-0 flex-1">
                        {/* Variable key */}
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-sm font-medium text-ink">
                            {result.key}
                          </span>
                          {result.isSensitive && (
                            <Lock className="h-3 w-3 shrink-0 text-warning" />
                          )}
                        </div>

                        {/* Project + Org */}
                        <p className="mt-0.5 truncate text-xs text-ink-subtle">
                          {result.projectName}
                          <span className="mx-1.5 text-ink-faint">/</span>
                          {result.organizationName}
                        </p>

                        {/* Environment + tag badges */}
                        {((result.environments &&
                          result.environments.length > 0) ||
                          (result.tags && result.tags.length > 0)) && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {result.environments?.map((env) => (
                              <span
                                key={env}
                                className={`inline-block rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                                  ENV_COLORS[env] ||
                                  "bg-surface-hover/10 text-ink-muted border-line-strong"
                                }`}
                              >
                                {env}
                              </span>
                            ))}
                            {result.tags?.map((tag) => (
                              <TagBadge
                                key={tag._id}
                                name={tag.name}
                                color={tag.color}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}

                {/* Documentation — published pages across every visible
                    project. Appended rather than given its own palette so
                    there is one Cmd+K and one shortcut. Metadata only; the
                    body is loaded when the page opens. */}
                {visibleDocs.length > 0 && (
                  <>
                    <div className="border-t border-line px-4 pt-3 pb-1 font-mono text-[10px] tracking-wider text-ink-faint uppercase">
                      Documentation
                    </div>
                    {visibleDocs.map((doc, index) => (
                      <button
                        key={doc._id}
                        data-testid={`palette-doc-${doc.slug}`}
                        data-nav-index={filteredResults.length + index}
                        onClick={() => navigateToDoc(doc)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                          filteredResults.length + index === clampedIndex
                            ? "bg-accent-soft"
                            : "hover:bg-surface-hover/50"
                        }`}
                      >
                        <div
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: doc.projectColor || "#71717a",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="truncate text-sm font-medium text-ink">
                            {doc.title}
                          </span>
                          <p className="mt-0.5 truncate text-xs text-ink-subtle">
                            {doc.projectName}
                            <span className="mx-1.5 text-ink-faint">/</span>
                            {doc.module}
                          </p>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Settings — three scopes, one search box. Entries are the
                    static index in @/settings/settings-index, so a tab that
                    moves does not silently strand its keywords. */}
                {settingsHits.length > 0 && (
                  <>
                    <div className="border-t border-line px-4 pt-3 pb-1 font-mono text-[10px] tracking-wider text-ink-faint uppercase">
                      Settings
                    </div>
                    {settingsHits.map((hit, index) => {
                      const navIndex =
                        filteredResults.length + visibleDocs.length + index;
                      return (
                        <button
                          key={`${hit.entry.scope}-${hit.entry.tab}-${hit.entry.label}`}
                          data-nav-index={navIndex}
                          data-testid={`palette-setting-${hit.entry.scope}-${hit.entry.tab}`}
                          onClick={() => navigateTo(hit.href)}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                            navIndex === clampedIndex
                              ? "bg-accent-soft"
                              : "hover:bg-surface-hover/50"
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                            {hit.entry.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                            {hit.entry.scope}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              {navCount > 0 && (
                <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10px] text-ink-faint">
                  <span>
                    <kbd className="rounded border border-line bg-surface-raised px-1 py-0.5 font-mono">
                      ↑↓
                    </kbd>{" "}
                    navigate
                  </span>
                  <span>
                    <kbd className="rounded border border-line bg-surface-raised px-1 py-0.5 font-mono">
                      ↵
                    </kbd>{" "}
                    open
                  </span>
                  <span>
                    <kbd className="rounded border border-line bg-surface-raised px-1 py-0.5 font-mono">
                      esc
                    </kbd>{" "}
                    close
                  </span>
                  <span className="ml-auto text-ink-faint">
                    {navCount} result{navCount !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
