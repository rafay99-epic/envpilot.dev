import { describe, it, expect, vi } from "vitest";
import { SingleFlight } from "./singleFlight";

describe("SingleFlight", () => {
  it("coalesces concurrent calls for the same key into one run", async () => {
    const sf = new SingleFlight();
    let calls = 0;
    let resolve!: (v: string) => void;
    const fn = () => {
      calls++;
      return new Promise<string>((r) => {
        resolve = r;
      });
    };

    const a = sf.run("k", fn);
    const b = sf.run("k", fn);
    const c = sf.run("k", fn);

    expect(calls).toBe(1); // only the first call actually invoked fn

    resolve("value");
    await expect(a).resolves.toBe("value");
    await expect(b).resolves.toBe("value");
    await expect(c).resolves.toBe("value");
  });

  it("does not coalesce different keys", async () => {
    const sf = new SingleFlight();
    const fn = vi.fn(async (v: string) => v);

    const [x, y] = await Promise.all([
      sf.run("a", () => fn("a")),
      sf.run("b", () => fn("b")),
    ]);

    expect(x).toBe("a");
    expect(y).toBe("b");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("re-runs after the previous call settles", async () => {
    const sf = new SingleFlight();
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };

    const first = await sf.run("k", fn);
    const second = await sf.run("k", fn);

    expect(first).toBe(1);
    expect(second).toBe(2); // entry cleared after settle, so it ran again
    expect(calls).toBe(2);
  });

  it("clears the in-flight entry even when the run rejects", async () => {
    const sf = new SingleFlight();
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error("boom");
    };

    await expect(sf.run("k", fn)).rejects.toThrow("boom");
    // A later call must not be stuck joining the failed promise.
    await expect(sf.run("k", fn)).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });

  it("clear() stops new callers from joining an in-flight request", async () => {
    const sf = new SingleFlight();
    const resolvers: Array<(v: number) => void> = [];
    const fn = () =>
      new Promise<number>((r) => {
        resolvers.push(r);
      });

    const a = sf.run("k", fn);
    sf.clear();
    const b = sf.run("k", fn); // must start a fresh run, not join `a`

    expect(resolvers).toHaveLength(2); // two independent runs, not coalesced

    resolvers[0](7);
    resolvers[1](8);
    await expect(a).resolves.toBe(7);
    await expect(b).resolves.toBe(8);
  });
});
