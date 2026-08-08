"use client";

import { useCallback, type RefObject } from "react";
import { listEnterAction, listIndentAction } from "@/lib/editor/lists";

/**
 * Markdown textarea commands. Ported from wryte's `EditorProvider`, flattened
 * to a hook since this editor is one component.
 *
 * Every mutation uses native `setRangeText` so the browser's undo stack
 * survives — rewriting `value` from state would destroy Cmd+Z. A synthetic
 * `input` event follows each one so React's onChange still fires.
 */
export function useMarkdownCommands(
  textareaRef: RefObject<HTMLTextAreaElement | null>
) {
  const notifyInput = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, []);

  /** Insert at the caret, replacing any selection. */
  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { selectionStart, selectionEnd } = textarea;
      textarea.focus();
      textarea.setRangeText(text, selectionStart, selectionEnd, "end");
      notifyInput(textarea);
    },
    [textareaRef, notifyInput]
  );

  /** Wrap the selection; re-running on wrapped text unwraps it, so toolbar
   *  buttons toggle instead of stacking markers. */
  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { selectionStart, selectionEnd, value } = textarea;
      const selected = value.slice(selectionStart, selectionEnd);

      textarea.focus();

      if (
        selected.length > 0 &&
        selected.startsWith(before) &&
        selected.endsWith(after) &&
        selected.length >= before.length + after.length
      ) {
        const unwrapped = selected.slice(
          before.length,
          selected.length - after.length
        );
        textarea.setRangeText(
          unwrapped,
          selectionStart,
          selectionEnd,
          "select"
        );
      } else if (selected.length === 0) {
        textarea.setRangeText(
          `${before}${after}`,
          selectionStart,
          selectionEnd,
          "end"
        );
        // Caret between the markers so typing lands inside.
        const caret = selectionStart + before.length;
        textarea.setSelectionRange(caret, caret);
      } else {
        textarea.setRangeText(
          `${before}${selected}${after}`,
          selectionStart,
          selectionEnd,
          "select"
        );
      }
      notifyInput(textarea);
    },
    [textareaRef, notifyInput]
  );

  /** Prefix every touched line; toggles off when all already carry it. */
  const prefixLines = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { selectionStart, selectionEnd, value } = textarea;
      const blockStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const nextBreak = value.indexOf("\n", selectionEnd);
      const blockEnd = nextBreak === -1 ? value.length : nextBreak;
      const lines = value.slice(blockStart, blockEnd).split("\n");

      const allPrefixed = lines.every((line) => line.startsWith(prefix));
      const next = lines
        .map((line) =>
          allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`
        )
        .join("\n");

      textarea.focus();
      textarea.setRangeText(next, blockStart, blockEnd, "select");
      notifyInput(textarea);
    },
    [textareaRef, notifyInput]
  );

  /** Select a character range and focus the textarea. Never mutates content. */
  const selectRange = useCallback(
    (start: number, end: number) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    },
    [textareaRef]
  );

  /** Wrap the selection in a link and leave "url" selected to type over.
   *  Shared so the toolbar button and Ctrl/⌘K behave identically. */
  const insertLink = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd);
    textarea.focus();
    textarea.setRangeText(
      `[${selected}](url)`,
      selectionStart,
      selectionEnd,
      "end"
    );
    const urlStart = selectionStart + selected.length + 3;
    textarea.setSelectionRange(urlStart, urlStart + 3);
    notifyInput(textarea);
  }, [textareaRef, notifyInput]);

  /** List continuation on Enter, Tab/Shift+Tab indent, formatting shortcuts. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = event.currentTarget;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          wrapSelection("**", "**");
          return;
        }
        if (key === "i") {
          event.preventDefault();
          wrapSelection("*", "*");
          return;
        }
        if (key === "e") {
          event.preventDefault();
          wrapSelection("`", "`");
          return;
        }
        if (key === "k") {
          event.preventDefault();
          insertLink();
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey && !mod) {
        const action = listEnterAction(textarea.value, textarea.selectionStart);
        if (!action) return;
        event.preventDefault();
        if (action.type === "continue") {
          textarea.setRangeText(
            action.insert,
            textarea.selectionStart,
            textarea.selectionEnd,
            "end"
          );
        } else {
          // Empty item: drop the marker.
          textarea.setRangeText("", action.start, action.end, "end");
        }
        notifyInput(textarea);
        return;
      }

      if (event.key === "Tab") {
        const action = listIndentAction(
          textarea.value,
          textarea.selectionStart,
          event.shiftKey
        );
        if (!action) {
          // Not a list line: indent rather than leaving the field.
          if (event.shiftKey) return;
          event.preventDefault();
          insertAtCursor("  ");
          return;
        }
        event.preventDefault();
        const caret = textarea.selectionStart;
        if (action.remove) {
          textarea.setRangeText(
            "",
            action.lineStart,
            action.lineStart + action.remove,
            "end"
          );
          textarea.setSelectionRange(
            Math.max(action.lineStart, caret - action.remove),
            Math.max(action.lineStart, caret - action.remove)
          );
        } else if (action.insert) {
          textarea.setRangeText(
            action.insert,
            action.lineStart,
            action.lineStart,
            "end"
          );
          textarea.setSelectionRange(
            caret + action.insert.length,
            caret + action.insert.length
          );
        }
        notifyInput(textarea);
      }
    },
    [wrapSelection, insertAtCursor, insertLink, notifyInput]
  );

  return {
    insertAtCursor,
    insertLink,
    wrapSelection,
    prefixLines,
    selectRange,
    handleKeyDown,
  };
}
