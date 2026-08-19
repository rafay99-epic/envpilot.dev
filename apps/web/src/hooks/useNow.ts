"use client";

import { startTransition, useEffect, useState } from "react";

/**
 * Wall-clock milliseconds, or `0` until the browser has supplied one.
 *
 * Client Components prerender on the server, so a bare `Date.now()` in a
 * render body is an unstable value: Cache Components can't bake it into the
 * static shell, and it would hydrate to a different number anyway. Deferring
 * the read to an effect keeps render pure.
 *
 * Callers MUST treat `0` as "not known yet" rather than 1970. The relative-time
 * formatters that consume this render an em dash for it.
 *
 * @param refreshMs Re-read on an interval, for labels that need to tick.
 */
export function useNow(refreshMs?: number): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    // startTransition so that if anything below suspends on this update,
    // React keeps the current UI rather than flashing the nearest fallback.
    startTransition(() => setNow(Date.now()));
    if (!refreshMs) return;

    const id = setInterval(
      () => startTransition(() => setNow(Date.now())),
      refreshMs
    );
    return () => clearInterval(id);
  }, [refreshMs]);

  return now;
}
