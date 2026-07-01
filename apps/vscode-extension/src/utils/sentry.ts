/**
 * Lazy facade over the Sentry chunk. @sentry/node accounts for most of the
 * extension bundle, so it's built into a separate file (dist/sentry.js, see
 * scripts/build.mjs) and only required after activation has finished — or
 * on demand when the first error is captured.
 */
type SentryRuntime = typeof import("./sentryRuntime");

let runtime: SentryRuntime | null = null;
let loadFailed = false;

function getRuntime(): SentryRuntime | null {
  if (runtime || loadFailed) return runtime;
  try {
    // "./sentry.js" is marked external in the esbuild config and resolved
    // at runtime relative to dist/extension.js.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    runtime = require("./sentry.js") as SentryRuntime;
  } catch {
    loadFailed = true;
  }
  return runtime;
}

export function initSentry(): void {
  // Defer the chunk load so it never competes with activation.
  setTimeout(() => {
    getRuntime()?.initSentry();
  }, 0);
}

export function captureError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  const rt = getRuntime();
  if (!rt) return;
  rt.initSentry();
  rt.captureError(error, context);
}

export function setSentryUser(userId: string, email?: string): void {
  getRuntime()?.setSentryUser(userId, email);
}

export function clearSentryUser(): void {
  getRuntime()?.clearSentryUser();
}

export async function closeSentry(): Promise<void> {
  // Only flush if the chunk was ever loaded — don't load it just to close it.
  if (!runtime) return;
  await runtime.closeSentry();
}
