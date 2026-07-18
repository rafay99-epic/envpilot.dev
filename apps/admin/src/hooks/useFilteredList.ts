import { useMemo } from "react";

/**
 * Case-insensitive substring filter across chosen fields of each item.
 * Search is trimmed; a blank search (or `undefined` items) is a passthrough.
 *
 * @example
 * const filtered = useFilteredList(users, search, (u) => [u.name, u.email]);
 */
export function useFilteredList<T>(
  items: T[] | undefined,
  search: string,
  fields: (item: T) => (string | null | undefined)[]
): T[] | undefined {
  return useMemo(() => {
    if (!items) return items;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    // `fields` is treated as a stable/inline selector — intentionally omitted
    // from deps so an inline arrow doesn't recompute every render.
    return items.filter((item) =>
      fields(item).some((f) => f != null && f.toLowerCase().includes(q))
    );
  }, [items, search]);
}
