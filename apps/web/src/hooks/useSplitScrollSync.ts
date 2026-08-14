"use client";

import { useCallback, useEffect, useRef } from "react";
import { caretRect } from "@/lib/editor/textarea-caret";
import { lineOfIndex } from "@/lib/editor/source-lines";

/**
 * Split-view scroll sync. Ported from wryte.xyz; takes pane refs directly
 * rather than reading a zustand store.
 *
 * Two mechanisms. Manual scrolling is ratio-based with a single owning pane,
 * so the echoed scroll event lands on the non-owner and the panes never
 * fight. Typing uses caret-follow instead: a growing textarea fires no
 * scroll event, so the preview is aligned to the block carrying the caret's
 * `data-source-line` — exact, not a ratio guess — and a ResizeObserver
 * re-runs it once the deferred re-render lands.
 */

type Pane = "editor" | "preview";

/** How far from the pane edge the caret is kept while typing. */
const CARET_MARGIN = 80;

export function useSplitScrollSync(enabled: boolean) {
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const owner = useRef<Pane>("editor");
  /** True while scrolling is driven by typing; cleared by manual intent. */
  const typing = useRef(false);
  /** Editor scroll events to swallow — echoes of our own programmatic nudge. */
  const skipEditorScroll = useRef(0);
  const followFrame = useRef(0);

  const getTextarea = useCallback(
    () => editorPaneRef.current?.querySelector("textarea") ?? null,
    []
  );

  /** The element whose scrollTop actually moves the editor's content. */
  const getEditorScroller = useCallback((): HTMLElement | null => {
    const textarea = getTextarea();
    if (textarea && textarea.scrollHeight > textarea.clientHeight + 1) {
      return textarea;
    }
    return editorPaneRef.current;
  }, [getTextarea]);

  const syncTo = useCallback(
    (source: HTMLElement | null, target: HTMLElement | null) => {
      if (!source || !target) return;
      const max = source.scrollHeight - source.clientHeight;
      const ratio = max > 0 ? source.scrollTop / max : 0;
      target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
    },
    []
  );

  /** Keep the caret visible in the editor and align the preview to it. */
  const followCaret = useCallback(() => {
    const pane = editorPaneRef.current;
    const preview = previewRef.current;
    const textarea = getTextarea();
    if (!pane || !preview || !textarea) return;

    const rect = caretRect(textarea, textarea.selectionStart);
    if (!rect) return;
    const paneBox = pane.getBoundingClientRect();
    let caretTop = textarea.getBoundingClientRect().top + rect.top;

    // Only in the wrapper-scroll case — an internally scrolling textarea
    // already keeps its own caret visible.
    if (textarea.scrollHeight <= textarea.clientHeight + 1) {
      let delta = 0;
      if (caretTop + rect.height > paneBox.bottom - CARET_MARGIN) {
        delta = caretTop + rect.height - (paneBox.bottom - CARET_MARGIN);
      } else if (caretTop < paneBox.top + CARET_MARGIN) {
        delta = caretTop - (paneBox.top + CARET_MARGIN);
      }
      if (delta !== 0) {
        skipEditorScroll.current++;
        pane.scrollTop += delta;
        caretTop -= delta;
      }
    }

    // Align the caret's source-line block to the caret's viewport fraction.
    const caretLine = lineOfIndex(textarea.value, textarea.selectionStart);
    let target: HTMLElement | null = null;
    for (const el of preview.querySelectorAll<HTMLElement>(
      "[data-source-line]"
    )) {
      const line = Number(el.dataset["sourceLine"]);
      if (line <= caretLine) target = el;
      else break;
    }
    if (!target) {
      // Nothing stamped yet (first render) — ratio is the best available.
      syncTo(getEditorScroller(), preview);
      return;
    }
    const frac = Math.min(
      Math.max((caretTop - paneBox.top) / paneBox.height, 0),
      1
    );
    const targetTop =
      target.getBoundingClientRect().top -
      preview.getBoundingClientRect().top +
      preview.scrollTop;
    preview.scrollTop = targetTop - frac * preview.clientHeight;
  }, [syncTo, getTextarea, getEditorScroller]);

  const scheduleFollow = useCallback(() => {
    cancelAnimationFrame(followFrame.current);
    followFrame.current = requestAnimationFrame(followCaret);
  }, [followCaret]);

  const setOwner = useCallback((pane: Pane) => {
    owner.current = pane;
  }, []);

  const onEditorScroll = useCallback(() => {
    if (skipEditorScroll.current > 0) {
      skipEditorScroll.current--;
      return;
    }
    if (owner.current !== "editor") return;
    // followCaret is precise; a ratio pass would overwrite it with a guess.
    if (typing.current) return;
    syncTo(getEditorScroller(), previewRef.current);
  }, [syncTo, getEditorScroller]);

  const onPreviewScroll = useCallback(() => {
    if (owner.current !== "preview") return;
    syncTo(previewRef.current, getEditorScroller());
  }, [syncTo, getEditorScroller]);

  // Typing → follow; wheel/touch/drag → back to ratio sync. Imperative
  // because the internal-scroll case needs a listener JSX can't reach.
  useEffect(() => {
    if (!enabled) return;
    const pane = editorPaneRef.current;
    const preview = previewRef.current;
    const textarea = getTextarea();
    if (!pane || !preview || !textarea) return;

    const onInput = () => {
      typing.current = true;
      owner.current = "editor";
      scheduleFollow();
    };
    // Wheel/touch also claims ownership — otherwise wheeling a pane the
    // pointer never clicked leaves the other pane owning, and the sync is
    // dropped as a foreign scroll.
    const manualIntent = (event: Event) => {
      typing.current = false;
      owner.current = event.currentTarget === preview ? "preview" : "editor";
    };

    // One AbortController owns every listener: aborting it detaches all of
    // them at once, so an added listener can't drift out of sync with a
    // hand-written removeEventListener.
    const listeners = new AbortController();
    const { signal } = listeners;

    textarea.addEventListener("input", onInput, { signal });
    textarea.addEventListener("scroll", onEditorScroll, { signal });
    for (const el of [pane, preview]) {
      el.addEventListener("wheel", manualIntent, { passive: true, signal });
      el.addEventListener("touchstart", manualIntent, {
        passive: true,
        signal,
      });
      el.addEventListener("pointerdown", manualIntent, { signal });
    }

    // The deferred re-render changes height after the keystroke.
    const observer = new ResizeObserver(() => {
      if (typing.current) scheduleFollow();
      else if (owner.current === "editor") {
        syncTo(getEditorScroller(), preview);
      }
    });
    const inner = preview.firstElementChild;
    if (inner) observer.observe(inner);

    const frame = followFrame;
    return () => {
      listeners.abort();
      observer.disconnect();
      cancelAnimationFrame(frame.current);
    };
  }, [
    enabled,
    onEditorScroll,
    scheduleFollow,
    syncTo,
    getTextarea,
    getEditorScroller,
  ]);

  return {
    editorPaneRef,
    previewRef,
    onEditorScroll,
    onPreviewScroll,
    setOwner,
  };
}
