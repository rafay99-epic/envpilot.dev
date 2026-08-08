"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Columns2, Eye, ListTree, Pencil } from "lucide-react";
import { useMarkdownCommands } from "@/hooks/useMarkdownCommands";
import { useSplitScrollSync } from "@/hooks/useSplitScrollSync";
import { parseOutline } from "@/lib/editor/outline";
import { resolveDoubleClickOffset } from "@/lib/editor/source-lines";
import { DocEditorToolbar } from "./doc-editor-toolbar";

// The renderer is only reachable through Split and Read, so Write — the
// default — never pays for the markdown chain.
const DocMarkdown = dynamic(
  () => import("./doc-markdown").then((m) => m.DocMarkdown),
  {
    ssr: false,
    loading: () => (
      <p className="p-4 text-sm text-zinc-500">Loading preview…</p>
    ),
  }
);

type ViewMode = "write" | "split" | "read";

const VIEW_MODES: {
  value: ViewMode;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "write", label: "Write", icon: Pencil },
  { value: "split", label: "Split", icon: Columns2 },
  { value: "read", label: "Read", icon: Eye },
];

interface DocEditorProps {
  body: string;
  onChange: (body: string) => void;
  /** Soft notices from the server's secret scan — shown, never blocking. */
  warnings?: string[];
  disabled?: boolean;
}

/**
 * Markdown editor with Write / Split / Read modes. Writing affordances
 * ported from wryte.xyz: caret-following split sync, list continuation,
 * Tab indent, formatting via `setRangeText` (keeps the native undo stack),
 * outline rail, double-click-in-preview to jump to source.
 *
 * A textarea, deliberately — the primary author is an agent writing markdown
 * over MCP, so WYSIWYG would be a large dependency for the secondary case.
 */
export function DocEditor({
  body,
  onChange,
  warnings = [],
  disabled = false,
}: DocEditorProps) {
  const [mode, setMode] = useState<ViewMode>("write");
  const [showOutline, setShowOutline] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    insertAtCursor,
    insertLink,
    wrapSelection,
    prefixLines,
    selectRange,
    handleKeyDown,
  } = useMarkdownCommands(textareaRef);

  const {
    editorPaneRef,
    previewRef,
    onEditorScroll,
    onPreviewScroll,
    setOwner,
  } = useSplitScrollSync(mode === "split");

  const outline = useMemo(
    () => (showOutline ? parseOutline(body) : []),
    [showOutline, body]
  );

  // Uncontrolled so `setRangeText` drives the native undo stack; this pushes
  // external changes in without clobbering what the user is typing.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && textarea.value !== body) textarea.value = body;
  }, [body]);

  const showEditor = mode === "write" || mode === "split";
  const showPreview = mode === "read" || mode === "split";

  /** Double-click a rendered block to put the caret on that source line. */
  const handlePreviewDoubleClick = (event: React.MouseEvent) => {
    if (mode !== "split") return;
    const offset = resolveDoubleClickOffset(event.target as HTMLElement, body);
    if (offset === null) return;
    selectRange(offset, offset);
  };

  // `min-h-0` is load-bearing: without it a flex child won't shrink below
  // its content, the row grows past the container, and the page scrolls as
  // well as the pane. No hardcoded pane height anywhere.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Same centred grid as the textarea, so controls sit over the text. */}
      <div className="mx-auto flex w-full max-w-[920px] flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/10 px-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5">
            {VIEW_MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                data-testid={`doc-editor-${value}`}
                onClick={() => setMode(value)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  mode === value
                    ? "bg-green-500/10 text-green-400"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          {showEditor && (
            <>
              <span className="h-4 w-px bg-zinc-700" />
              <DocEditorToolbar
                onWrap={wrapSelection}
                onPrefix={prefixLines}
                onInsert={insertAtCursor}
                onLink={insertLink}
                disabled={disabled}
              />
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="doc-outline-toggle"
            onClick={() => setShowOutline((value) => !value)}
            aria-pressed={showOutline}
            title="Outline"
            className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
              showOutline
                ? "bg-green-500/10 text-green-400"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            <ListTree className="h-3.5 w-3.5" />
            Outline
          </button>
          <span className="font-mono text-[11px] text-zinc-400">
            {body.length.toLocaleString()} chars
          </span>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="flex items-start gap-2 border-b border-amber-900/40 px-8 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            {warnings.map((warning) => (
              <p
                key={warning}
                className="text-xs text-amber-700 dark:text-amber-300"
              >
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {showOutline && (
          <nav className="slim-scrollbar w-56 shrink-0 overflow-y-auto border-r border-white/10 px-4 py-5">
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
              Outline
            </p>
            {outline.length === 0 ? (
              <p className="text-xs text-zinc-500">No headings yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {outline.map((heading) => (
                  <li key={`${heading.start}-${heading.text}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("write");
                        // From Read the textarea is unmounted, so selecting
                        // now is a no-op — wait for the commit.
                        requestAnimationFrame(() =>
                          selectRange(heading.start, heading.end)
                        );
                      }}
                      style={{ paddingLeft: `${(heading.level - 1) * 10}px` }}
                      className="w-full truncate rounded px-1.5 py-1 text-left text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      {heading.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}

        {showEditor && (
          <div
            ref={editorPaneRef}
            onScroll={onEditorScroll}
            onPointerDown={() => setOwner("editor")}
            // overflow-HIDDEN: the textarea is the single scroller for this
            // column. Nesting two scrollers gives duelling scrollbars.
            className={`min-w-0 overflow-hidden ${
              mode === "split" ? "w-1/2 border-r border-white/10" : "w-full"
            }`}
          >
            <textarea
              ref={textareaRef}
              data-testid="doc-body-input"
              defaultValue={body}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              data-gramm="false"
              // The writing column IS the surface — its own edges mark the
              // editor's extent, which a full-width wash never could.
              // Type metrics from wryte. `h-full` (not min-h-full) keeps it
              // exactly as tall as its pane, so it stays the single scroller.
              className="slim-scrollbar mx-auto block h-full w-full max-w-[920px] resize-none overflow-y-auto bg-white/[0.04] px-10 py-8 font-mono text-[15px] leading-[1.85] text-zinc-200 caret-green-400 outline-none selection:bg-green-500/25 placeholder:text-zinc-600 disabled:opacity-60"
              placeholder="Write the page in markdown…"
            />
          </div>
        )}

        {showPreview && (
          <div
            ref={previewRef}
            onScroll={onPreviewScroll}
            onPointerDown={() => setOwner("preview")}
            onDoubleClick={handlePreviewDoubleClick}
            data-testid="doc-preview"
            title={
              mode === "split"
                ? "Double-click any block to jump the caret there"
                : undefined
            }
            className={`slim-scrollbar min-w-0 overflow-y-auto px-10 py-8 ${
              mode === "split" ? "w-1/2 bg-white/[0.02]" : "w-full"
            }`}
          >
            {/* Narrower than the writing column: proportional type reads
                tighter than monospace. */}
            <div
              className={
                mode === "read"
                  ? "mx-auto max-w-[820px]"
                  : "mx-auto max-w-[640px]"
              }
            >
              {body.trim().length > 0 ? (
                <DocMarkdown body={body} />
              ) : (
                <p className="text-sm text-zinc-500">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
