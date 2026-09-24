type SentryRuntime = typeof import("./sentryRuntime");

let runtime: SentryRuntime | null = null;
let loadFailed = false;

function getRuntime(): SentryRuntime | null {
  if (runtime || loadFailed) return runtime;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    runtime = require("./sentry.js") as SentryRuntime;
  } catch {
    loadFailed = true;
  }
  return runtime;
}

export function initSentry(): void {
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

export function setSentryUser(userId: string): void {
  getRuntime()?.setSentryUser(userId);
}

export function clearSentryUser(): void {
  getRuntime()?.clearSentryUser();
}

export async function closeSentry(): Promise<void> {
  if (!runtime) return;
  await runtime.closeSentry();
}
