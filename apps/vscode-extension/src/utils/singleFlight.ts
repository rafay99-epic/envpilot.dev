// Single-flight request coalescing.
//
// When a burst of identical work is requested concurrently (e.g. a sync fans
// out to many directories and subscriptions, each asking for the same
// project's variables), we want ONE underlying operation, not N. `run` returns
// the in-flight promise for a key if one exists; otherwise it starts the work,
// tracks it, and clears the entry when it settles — so a later call re-runs.
//
// This is pure (no `vscode`/`axios` imports) so it is unit-testable in Node.

export class SingleFlight {
  private inflight = new Map<string, Promise<unknown>>();

  /**
   * Run `fn` under single-flight for `key`. Concurrent callers with the same
   * key share the first call's promise. The entry is removed once the promise
   * settles (success or failure), so subsequent calls start fresh work.
   */
  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = fn().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, p);
    return p;
  }

  /**
   * Forget all tracked requests so new callers won't join one that is already
   * in flight (used when the session/token changes). Promises already returned
   * still settle for their original callers.
   */
  clear(): void {
    this.inflight.clear();
  }
}
