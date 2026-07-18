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
    // Identity-checked cleanup: after delete()/clear(), a NEW run may have
    // registered under this key — the old promise's settle must not evict it.
    const p: Promise<T> = fn().finally(() => {
      if (this.inflight.get(key) === p) this.inflight.delete(key);
    });
    this.inflight.set(key, p);
    return p;
  }

  /**
   * Forget ONE tracked request so new callers for that key start fresh work.
   * A promise already returned still settles for its original callers.
   */
  delete(key: string): void {
    this.inflight.delete(key);
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
