// Mirrors PURGE_RETENTION_DAYS in convex/features/vault/gc.ts (server-only
// module — must not end up in the client bundle).
export const RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(timestamp: number, now: number): number {
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

export function daysLeft(deletedAt: number, now: number): number {
  const remaining = deletedAt + RETENTION_DAYS * DAY_MS - now;
  return Math.max(0, Math.ceil(remaining / DAY_MS));
}

export function pluralDays(count: number): string {
  return `${count} day${count === 1 ? "" : "s"}`;
}
