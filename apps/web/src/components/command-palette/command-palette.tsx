"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { Hotkey, HotkeySequence } from "@tanstack/react-hotkeys";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Lock, X } from "lucide-react";
import { useAuthContext } from "@/components/auth";
import { useConvexUser, useGlobalSearch } from "@/hooks";
import { ENVIRONMENTS } from "@/constants/project";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { SHORTCUTS, parseBinding } from "@/hooks/useKeyboardShortcuts";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

const ENV_FILTERS = ["all", ...ENVIRONMENTS] as const;
type EnvFilter = (typeof ENV_FILTERS)[number];

const ENV_COLORS: Record<string, string> = {
  development: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  staging: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  production: "bg-green-500/10 text-green-400 border-green-500/20",
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);
  const { searchTerm, setSearchTerm, results, isLoading } =
    useGlobalSearch(convexUserId);

  // Filter results by environment
  const filteredResults =
    envFilter === "all"
      ? results
      : results.filter((r) =>
          r.environments?.some((e) => e.toLowerCase().includes(envFilter))
        );

  // Clamp selectedIndex to valid range
  const clampedIndex =
    filteredResults.length === 0
      ? 0
      : Math.min(selectedIndex, filteredResults.length - 1);

  function handleSearch(value: string) {
    setSearchTerm(value);
    setSelectedIndex(0);
  }

  function handleFilterChange(filter: EnvFilter) {
    setEnvFilter(filter);
    setSelectedIndex(0);
  }

  function openPalette() {
    setSearchTerm("");
    setEnvFilter("all");
    setSelectedIndex(0);
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closePalette() {
    setIsOpen(false);
  }

  // Global hotkey — respects custom bindings
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const cmdPaletteKeys = customBindings.COMMAND_PALETTE ?? SHORTCUTS.COMMAND_PALETTE.keys;
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
    { enabled: cmdPaletteBinding.type === "sequence" }
  );

  // Listen for custom open event (from search trigger button)
  useEffect(() => {
    function handleOpen() {
      openPalette();
    }
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpen);
    return () =>
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpen);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[clampedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [clampedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredResults.length - 1
      );
    } else if (e.key === "Enter" && filteredResults[clampedIndex]) {
      e.preventDefault();
      navigateToResult(filteredResults[clampedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  }

  function navigateToResult(result: (typeof filteredResults)[0]) {
    closePalette();
    router.push(`/dashboard/projects/${result.projectSlug}`);
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
            <div className="overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-2xl">
              {/* Search Input */}
              <div className="flex items-center gap-3 border-b border-zinc-700/50 px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-zinc-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search variables across all projects..."
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
                />
                <kbd className="hidden shrink-0 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline-block">
                  ESC
                </kbd>
                <button
                  onClick={() => closePalette()}
                  className="rounded p-0.5 text-zinc-500 hover:text-zinc-300 sm:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Environment Filter Chips */}
              <div className="flex gap-1.5 border-b border-zinc-700/50 px-4 py-2">
                {ENV_FILTERS.map((env) => (
                  <button
                    key={env}
                    onClick={() => handleFilterChange(env)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                      envFilter === env
                        ? "bg-green-500/10 text-green-400 border border-green-500/30"
                        : "text-zinc-500 hover:text-zinc-300 border border-zinc-700/50 hover:border-zinc-600"
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>

              {/* Results */}
              <div
                ref={listRef}
                className="max-h-[50vh] overflow-y-auto sm:max-h-[400px]"
              >
                {searchTerm.length < 2 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500">
                    Type at least 2 characters to search...
                  </div>
                ) : isLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500">
                    <span className="inline-block animate-pulse">
                      Searching...
                    </span>
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-zinc-500">
                    No variables found for &ldquo;{searchTerm}&rdquo;
                  </div>
                ) : (
                  filteredResults.map((result, index) => (
                    <button
                      key={result._id}
                      onClick={() => navigateToResult(result)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                        index === clampedIndex
                          ? "bg-green-500/10"
                          : "hover:bg-zinc-800/50"
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
                          <span className="truncate font-mono text-sm font-medium text-zinc-100">
                            {result.key}
                          </span>
                          {result.isSensitive && (
                            <Lock className="h-3 w-3 shrink-0 text-amber-500" />
                          )}
                        </div>

                        {/* Project + Org */}
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {result.projectName}
                          <span className="mx-1.5 text-zinc-700">/</span>
                          {result.organizationName}
                        </p>

                        {/* Environment badges */}
                        {result.environments &&
                          result.environments.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {result.environments.map((env) => (
                                <span
                                  key={env}
                                  className={`inline-block rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                                    ENV_COLORS[env] ||
                                    "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                  }`}
                                >
                                  {env}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Footer */}
              {filteredResults.length > 0 && (
                <div className="flex items-center gap-4 border-t border-zinc-700/50 px-4 py-2 text-[10px] text-zinc-600">
                  <span>
                    <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono">
                      ↑↓
                    </kbd>{" "}
                    navigate
                  </span>
                  <span>
                    <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono">
                      ↵
                    </kbd>{" "}
                    open
                  </span>
                  <span>
                    <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 font-mono">
                      esc
                    </kbd>{" "}
                    close
                  </span>
                  <span className="ml-auto text-zinc-600">
                    {filteredResults.length} result
                    {filteredResults.length !== 1 ? "s" : ""}
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
