import { lock, lockSync } from "proper-lockfile";
import { AsyncLocalStorage } from "node:async_hooks";

const lockOptions = {
  realpath: false,
  stale: 10_000,
  update: 2_000,
} as const;

const asyncLockOptions = {
  ...lockOptions,
  retries: {
    retries: 20,
    factor: 1.2,
    minTimeout: 25,
    maxTimeout: 100,
    randomize: true,
  },
} as const;
const configLockScope = new AsyncLocalStorage<boolean>();

function assertConfigLockNotHeld(): void {
  if (configLockScope.getStore()) {
    throw new Error("Config lock cannot be acquired recursively.");
  }
}

function sleepSync(timeout: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, timeout);
}

export async function withConfigLock<T>(
  configPath: string,
  work: () => T | Promise<T>
): Promise<T> {
  assertConfigLockNotHeld();
  const release = await lock(configPath, asyncLockOptions);

  try {
    return await configLockScope.run(true, work);
  } finally {
    await release();
  }
}

export function withConfigLockSync<T>(configPath: string, work: () => T): T {
  assertConfigLockNotHeld();
  for (let attempt = 0; ; attempt++) {
    try {
      const release = lockSync(configPath, lockOptions);
      try {
        return configLockScope.run(true, work);
      } finally {
        release();
      }
    } catch (error) {
      if (
        attempt >= 20 ||
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ELOCKED"
      ) {
        throw error;
      }
      const timeout = Math.min(25 * 1.2 ** attempt, 100);
      sleepSync(timeout);
    }
  }
}
