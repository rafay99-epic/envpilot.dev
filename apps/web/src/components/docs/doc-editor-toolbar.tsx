"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link2,
  Plus,
  Strikethrough,
} from "lucide-react";

/**
 * Formatting controls for the markdown editor.
 *
 * Four inline buttons plus one Insert menu, rather than the fifteen-icon row
 * this started as. Markdown authors type most syntax directly; the toolbar is
 * a reminder and a shortcut, not the primary input. Everything structural
 * (headings, lists, blocks) is one click deeper, where it costs nothing to
 * scan past.
 */

type Command =
  | { kind: "wrap"; before: string; after: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "insert"; text: string }
  // Link is its own kind so the button and Ctrl/⌘K run the SAME code — a
  // plain wrap selects the whole `[text](url)` instead of just `url`.
  | { kind: "link" };

const INLINE: {
  label: string;
  shortcut: string;
  icon: React.ElementType;
  command: Command;
}[] = [
  {
    label: "Bold",
    shortcut: "Ctrl/⌘B",
    icon: Bold,
    command: { kind: "wrap", before: "**", after: "**" },
  },
  {
    label: "Italic",
    shortcut: "Ctrl/⌘I",
    icon: Italic,
    command: { kind: "wrap", before: "*", after: "*" },
  },
  {
    label: "Code",
    shortcut: "Ctrl/⌘E",
    icon: Code,
    command: { kind: "wrap", before: "`", after: "`" },
  },
  {
    label: "Link",
    shortcut: "Ctrl/⌘K",
    icon: Link2,
    command: { kind: "link" },
  },
];

const INSERT_GROUPS: { heading: string; items: [string, Command][] }[] = [
  {
    heading: "Headings",
    items: [
      ["Heading 1", { kind: "prefix", prefix: "# " }],
      ["Heading 2", { kind: "prefix", prefix: "## " }],
      ["Heading 3", { kind: "prefix", prefix: "### " }],
    ],
  },
  {
    heading: "Lists",
    items: [
      ["Bullet list", { kind: "prefix", prefix: "- " }],
      ["Numbered list", { kind: "prefix", prefix: "1. " }],
      ["Task list", { kind: "prefix", prefix: "- [ ] " }],
      ["Quote", { kind: "prefix", prefix: "> " }],
    ],
  },
  {
    heading: "Blocks",
    items: [
      ["Code block", { kind: "insert", text: "\n```\n\n```\n" }],
      [
        "Diagram",
        {
          kind: "insert",
          text: "\n```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```\n",
        },
      ],
      [
        "Table",
        {
          kind: "insert",
          text: "\n| Field | Type | Notes |\n| ----- | ---- | ----- |\n|  |  |  |\n",
        },
      ],
      ["Strikethrough", { kind: "wrap", before: "~~", after: "~~" }],
      ["Divider", { kind: "insert", text: "\n---\n" }],
    ],
  },
];

const ICON_BUTTON =
  "rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

interface DocEditorToolbarProps {
  onWrap: (before: string, after: string) => void;
  onPrefix: (prefix: string) => void;
  onInsert: (text: string) => void;
  onLink: () => void;
  disabled?: boolean;
}

export function DocEditorToolbar({
  onWrap,
  onPrefix,
  onInsert,
  onLink,
  disabled = false,
}: DocEditorToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust-during-render rather than an effect: disabling mid-open (a save
  // starting) otherwise left menuOpen true, so the trigger reported
  // aria-expanded with nothing shown and the menu sprang back on re-enable.
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setMenuOpen(false);
  }

  // Close on outside click or Escape. No dropdown primitive exists in this
  // app and Radix is not a dependency — one effect is cheaper than adding one.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const run = (command: Command) => {
    if (command.kind === "wrap") onWrap(command.before, command.after);
    else if (command.kind === "prefix") onPrefix(command.prefix);
    else if (command.kind === "link") onLink();
    else onInsert(command.text);
  };

  return (
    <div className="flex items-center gap-0.5">
      {INLINE.map(({ label, shortcut, icon: Icon, command }) => (
        <button
          key={label}
          type="button"
          // Toolbar clicks must not steal focus, or setRangeText has no
          // selection to act on and the command lands at offset 0.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(command)}
          disabled={disabled}
          title={`${label} (${shortcut})`}
          aria-label={label}
          data-testid={`doc-tool-${label.toLowerCase()}`}
          className={ICON_BUTTON}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMenuOpen((open) => !open)}
          disabled={disabled}
          aria-expanded={menuOpen && !disabled}
          data-testid="doc-tool-insert"
          className="ml-1 flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Insert
          <ChevronDown className="h-3 w-3" />
        </button>

        {/* A plain disclosure, not a `menu`: menu semantics promise
            arrow-key roving focus, which this doesn't implement. Tab
            reaches the buttons natively. Never open while disabled — the
            menu could otherwise outlive the prop flipping mid-save. */}
        {menuOpen && !disabled && (
          <div className="absolute top-full left-0 z-20 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {INSERT_GROUPS.map((group, groupIndex) => (
              <div key={group.heading}>
                {groupIndex > 0 && (
                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                )}
                <p className="px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">
                  {group.heading}
                </p>
                {group.items.map(([label, command]) => (
                  <button
                    key={label}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      run(command);
                      setMenuOpen(false);
                    }}
                    data-testid={`doc-insert-${label.toLowerCase().replace(/\s+/g, "-")}`}
                    className="block w-full px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
