/**
 * Best-effort Sentry reporting from the Convex action runtime.
 *
 * Convex functions do not run in Next.js, so `@sentry/nextjs` and the
 * `createLogger` bridge in apps/web are both unavailable here. A `console.error`
 * inside a Convex function lands in the Convex log and nowhere else, which is
 * exactly how a failing vault fan-out could be invisible until someone opened a
 * terminal. This posts to Sentry's store endpoint directly.
 *
 * Lifted out of features/vault/gc.ts, which has used this shape since the GC
 * cron shipped, so background failures report through ONE path rather than each
 * caller inventing its own.
 *
 * Contract: never throws and never rejects. Observability must not be able to
 * fail the work it is reporting on.
 */

type ReportOptions = {
  /** Groups the issue in Sentry. Use a stable, low-cardinality string. */
  source: string;
  /** Extra tags. Values are sent as-is, so never put a secret in one. */
  tags?: Record<string, string>;
};

export async function reportToSentry(
  message: string,
  { source, tags = {} }: ReportOptions
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Standard DSN shape: https://<key>[:secret]@<host>/<projectId>
    const match = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn);
    if (!match) return;
    const key = match[1]!.split(":")[0];
    const host = match[2];
    const projectId = match[3];
    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}`,
      },
      body: JSON.stringify({
        message,
        level: "error",
        tags: { surface: "convex", source, ...tags },
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Swallow: a failed report must never fail the caller.
  }
}
