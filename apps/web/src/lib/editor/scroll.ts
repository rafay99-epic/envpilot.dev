/** Nearest scrollable ancestor of `el`, or null.
 * Ported from wryte.xyz (apps/web/src/features/editor/lib/scroll.ts).
 * Pure logic, no wryte dependencies — kept verbatim so fixes can be diffed
 * against the original.
 */
export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
