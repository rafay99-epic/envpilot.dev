export class SingleFlight {
  private inflight = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p: Promise<T> = fn().finally(() => {
      if (this.inflight.get(key) === p) this.inflight.delete(key);
    });
    this.inflight.set(key, p);
    return p;
  }

  async wait(prefix: string): Promise<void> {
    await Promise.allSettled(
      [...this.inflight]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, flight]) => flight)
    );
  }

  delete(key: string): void {
    this.inflight.delete(key);
  }

  clear(): void {
    this.inflight.clear();
  }
}
