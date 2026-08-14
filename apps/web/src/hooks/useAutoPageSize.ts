"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

interface UseAutoPageSizeOptions {
  /** Page size used until the grid has painted and can be measured. */
  fallbackPageSize?: number;
  minRows?: number;
  maxRows?: number;
}

interface UseAutoPageSizeResult<TFooter extends HTMLElement> {
  /** Items per page: measured grid columns x rows that fit the viewport. */
  pageSize: number;
  /** Attach to the element carrying the `grid` classes. */
  gridRef: (node: HTMLElement | null) => void;
  /** Attach to the element rendered directly below the grid (pagination). */
  footerRef: RefObject<TFooter | null>;
}

/**
 * Derives a page size from the space the grid actually has, instead of a
 * hardcoded constant that leaves a dead band at the bottom on tall screens.
 *
 * Columns and row height are read off the laid-out DOM, so the responsive
 * `sm:/lg:grid-cols-*` classes stay the single source of truth for the
 * breakpoints. The measurement deliberately never reads the grid's own
 * height — only its offset from the scroll container's content top — so
 * growing the page can't feed back into the number of rows that fit.
 */
export function useAutoPageSize<TFooter extends HTMLElement = HTMLDivElement>({
  fallbackPageSize = 9,
  minRows = 1,
  maxRows = 10,
}: UseAutoPageSizeOptions = {}): UseAutoPageSizeResult<TFooter> {
  const [grid, setGrid] = useState<HTMLElement | null>(null);
  const footerRef = useRef<TFooter | null>(null);
  // Reserved space only ever grows. The pagination bar unmounts once
  // everything fits on one page, and letting the reserve shrink with it would
  // hand the grid back the very row that made it fit — a resize loop.
  const reservedRef = useRef(0);
  const [pageSize, setPageSize] = useState(fallbackPageSize);

  useEffect(() => {
    if (!grid) return;

    const scroller = grid.closest("main") ?? document.documentElement;

    const measure = () => {
      const firstItem = grid.firstElementChild;
      if (!(firstItem instanceof HTMLElement)) return;

      const rowHeight = firstItem.getBoundingClientRect().height;
      if (rowHeight <= 0) return;

      const gridStyles = getComputedStyle(grid);
      const columns = gridStyles.gridTemplateColumns
        .split(" ")
        .filter(Boolean).length;
      const rowGap = Number.parseFloat(gridStyles.rowGap) || 0;

      const footer = footerRef.current;
      if (footer) {
        const footerStyles = getComputedStyle(footer);
        reservedRef.current = Math.max(
          reservedRef.current,
          footer.getBoundingClientRect().height +
            (Number.parseFloat(footerStyles.marginTop) || 0)
        );
      }

      // Bottom padding of every wrapper between the grid and the scroll
      // viewport, so the last row doesn't sit flush against the edge.
      let gutter = 0;
      for (let el = grid.parentElement; el && el !== scroller; ) {
        gutter += Number.parseFloat(getComputedStyle(el).paddingBottom) || 0;
        el = el.parentElement;
      }

      // Offset from the scroll container's CONTENT top — independent of both
      // scroll position and the grid's own height.
      const offsetTop =
        grid.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;

      const available =
        scroller.clientHeight - offsetTop - reservedRef.current - gutter;
      const rows = Math.floor((available + rowGap) / (rowHeight + rowGap));

      setPageSize(columns * Math.min(Math.max(rows, minRows), maxRows));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid, minRows, maxRows]);

  return { pageSize, gridRef: setGrid, footerRef };
}
