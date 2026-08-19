"use client";

import { startTransition, useEffect, useState } from "react";

export function useNow(refreshMs?: number): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
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
