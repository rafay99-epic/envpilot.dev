"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface SearchEntry {
  slug: string;
  title: string;
  section: string;
  description: string;
  headings: string[];
}

const MAX_RESULTS = 12;

/**
 * Score one entry against a lowercased query.
 *
 * Deliberately dumb substring matching, weighted by where the hit lands:
 * a title hit beats a heading hit beats prose. With a corpus this size that
 * ranks better than anyone needs.
 *
 * ponytail: substring scoring over ~60 docs. Swap in a real index (Orama,
 * Algolia) only if the corpus outgrows a few hundred pages.
 */
function score(entry: SearchEntry, query: string): number {
  const title = entry.title.toLowerCase();
  const slug = entry.slug.toLowerCase();
  if (title === query || slug === query) return 100;

  let points = 0;
  if (title.startsWith(query)) points += 60;
  else if (title.includes(query)) points += 40;
  if (slug.includes(query)) points += 20;
  if (entry.section.toLowerCase().includes(query)) points += 10;
  if (entry.headings.some((h) => h.toLowerCase().includes(query))) points += 15;
  if (entry.description.toLowerCase().includes(query)) points += 5;
  return points;
}

/** Top matches for a lowercased query, best first. Empty query lists the corpus. */
function search(entries: SearchEntry[], query: string): SearchEntry[] {
  if (!query) return entries.slice(0, MAX_RESULTS);

  const hits: { entry: SearchEntry; points: number }[] = [];
  for (const entry of entries) {
    const points = score(entry, query);
    if (points > 0) hits.push({ entry, points });
  }
  return hits
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_RESULTS)
    .map((hit) => hit.entry);
}

type IndexState =
  | { status: "loading" }
  | { status: "ready"; entries: SearchEntry[] }
  | { status: "failed" };

async function fetchSearchIndex(): Promise<SearchEntry[]> {
  const response = await fetch("/search-index.json");
  // fetch resolves on 4xx/5xx, so an unchecked body would parse an error page
  // as the index and report it to the reader as "no matches".
  if (!response.ok) {
    throw new Error(`search index request failed: ${response.status}`);
  }
  return (await response.json()) as SearchEntry[];
}

/**
 * One request per tab, shared by every mounted search box (the sidebar renders
 * one for the desktop rail and one for the mobile nav) and reused across opens.
 */
let indexRequest: Promise<SearchEntry[]> | null = null;

function loadSearchIndex(): Promise<SearchEntry[]> {
  const pending =
    indexRequest ??
    fetchSearchIndex().catch((error: unknown) => {
      indexRequest = null; // a failed load must not be cached for the session
      throw error;
    });
  indexRequest = pending;
  return pending;
}

/**
 * Cmd+K search over the static /search-index.json.
 *
 * The index is fetched once, on first open, so a reader who never searches
 * never pays for it.
 */
export function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [indexState, setIndexState] = useState<IndexState>({
    status: "loading",
  });
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const results =
    indexState.status === "ready"
      ? search(indexState.entries, query.trim().toLowerCase())
      : [];

  // Hanging the load off `open` rather than off each handler that sets it is
  // what keeps two opens (or two mounted boxes) from starting two requests.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadSearchIndex().then(
      (entries) => {
        if (!cancelled) setIndexState({ status: "ready", entries });
      },
      () => {
        if (!cancelled) setIndexState({ status: "failed" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((wasOpen) => !wasOpen);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Outside-click dismissal listens on the document so the scrim stays pure
  // decoration: a click handler on it would announce the backdrop as a control.
  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      router.push(`/${results[active].slug}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setActive(0);
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface/40 px-3 py-2 text-left text-xs text-ink-subtle transition-colors hover:border-accent-line hover:text-ink-muted"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">search docs</span>
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-canvas shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Search the docs…"
                aria-label="Search the docs"
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                esc
              </kbd>
            </div>

            <ul className="max-h-[55vh] overflow-y-auto p-2">
              {indexState.status === "loading" && (
                <li className="px-3 py-6 text-center font-mono text-xs text-ink-faint">
                  loading index…
                </li>
              )}
              {indexState.status === "failed" && (
                <li className="px-3 py-6 text-center font-mono text-xs text-ink-faint">
                  search index failed to load, reopen to retry
                </li>
              )}
              {indexState.status === "ready" && results.length === 0 && (
                <li className="px-3 py-6 text-center font-mono text-xs text-ink-faint">
                  no matches for &ldquo;{query}&rdquo;
                </li>
              )}
              {results.map((entry, index) => (
                <li key={entry.slug}>
                  <a
                    href={`/${entry.slug}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-3 py-2 transition-colors ${
                      index === active
                        ? "bg-accent-soft text-accent"
                        : "text-ink-muted hover:bg-surface-hover"
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm">{entry.title}</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                        {entry.section}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-subtle">
                      {entry.description}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
