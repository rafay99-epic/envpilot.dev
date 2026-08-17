/**
 * Bounded-concurrency worker pool.
 *
 * A continuous pool, not batched waves: `width` workers run, and each one
 * claims the next item the instant it finishes its own. Waves idle every
 * worker that finishes early until the slowest in the wave lands, which on a
 * fan-out of vault writes wastes most of the wall clock.
 *
 * Used by every bulk vault path (template creation, import, export) so there
 * is one throughput ceiling and one place to tune it.
 *
 * Deliberately NOT @convex-dev/workpool: that component persists each item's
 * arguments to the database, which is disqualifying for any path whose items
 * carry secret plaintext.
 */

/** Concurrent vault requests per bulk operation. */
export const VAULT_POOL_WIDTH = 8;

/**
 * Run `fn` over `items`, at most `width` at a time, preserving input order in
 * the result.
 *
 * On failure the pool stops claiming new items and waits for the workers
 * already in flight before rethrowing. That wait is not politeness: the vault
 * callers clean up the secrets they minted in their `catch`, and a worker
 * still running would mint MORE after that sweep had finished, leaving
 * exactly the orphaned secret the cleanup exists to prevent. When this
 * rejects, nothing is still running.
 *
 * Callers that want per-item failure instead (import) pass an `fn` that
 * catches and returns a result variant rather than throwing.
 */
export async function pool<T, R>(
  items: readonly T[],
  width: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettled?: (completed: number) => void
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let completed = 0;
  // An array rather than a nullable: TypeScript cannot see that a closure
  // assigns to a `let`, so narrowing after the await would collapse it.
  const failures: unknown[] = [];

  const worker = async (): Promise<void> => {
    for (
      let i = next++;
      i < items.length && failures.length === 0;
      i = next++
    ) {
      try {
        out[i] = await fn(items[i]!, i);
      } catch (error) {
        // First failure wins; later ones are consequences of the same abort.
        failures.push(error);
        return;
      }
      onSettled?.(++completed);
    }
  };

  // Never rejects, so every worker is settled before the throw below.
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, worker)
  );
  if (failures.length > 0) throw failures[0];
  return out;
}

/**
 * Throttle for progress reporting: fires on every `every`-th completion, on
 * any completion more than `intervalMs` since the last report, and always on
 * the final one. Keeps a 500-item import from writing 500 progress mutations
 * while still moving the bar in visible increments.
 */
export function throttleProgress(
  total: number,
  report: (completed: number) => void,
  { every = 10, intervalMs = 250 }: { every?: number; intervalMs?: number } = {}
): (completed: number) => void {
  let lastAt = 0;
  let lastCount = 0;
  return (completed) => {
    const now = Date.now();
    const isLast = completed === total;
    if (!isLast && completed - lastCount < every && now - lastAt < intervalMs) {
      return;
    }
    lastAt = now;
    lastCount = completed;
    report(completed);
  };
}
