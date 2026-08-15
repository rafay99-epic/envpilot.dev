/**
 * Date and number formatting with an explicit locale and time zone.
 *
 * A bare `toLocaleDateString()` formats with the server's locale and zone
 * during SSR and the visitor's after hydration, so the two renders disagree
 * and React reports a hydration mismatch. Every helper here takes the zone as
 * an argument and defaults to UTC, which is what the server can always agree
 * on. Components that want the visitor's own zone pair these with
 * `useTimeZone()`, which returns UTC until mount and the real zone after.
 */

const LOCALE = "en-US";

export const SERVER_TIME_ZONE = "UTC";

type DateInput = number | string | Date;

const toDate = (value: DateInput) =>
  value instanceof Date ? value : new Date(value);

/** "Jan 5, 2026" */
export function formatDate(
  value: DateInput,
  timeZone: string = SERVER_TIME_ZONE
) {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeZone,
  }).format(toDate(value));
}

/** "Jan 5, 2026, 3:04 PM" */
export function formatDateTime(
  value: DateInput,
  timeZone: string = SERVER_TIME_ZONE
) {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(toDate(value));
}

/** "3:04 PM" */
export function formatTime(
  value: DateInput,
  timeZone: string = SERVER_TIME_ZONE
) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeStyle: "short",
    timeZone,
  }).format(toDate(value));
}

/** "01/05/26, 3:04 PM" — the compact form used in dense tables. */
export function formatDateTimeShort(
  value: DateInput,
  timeZone: string = SERVER_TIME_ZONE
) {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(toDate(value));
}

/** Escape hatch for one-off option sets. Locale and zone stay explicit. */
export function formatDateWith(
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = SERVER_TIME_ZONE
) {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, ...options }).format(
    toDate(value)
  );
}

/** "1,234" — pinned to one locale so SSR and the browser agree. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
) {
  return new Intl.NumberFormat(LOCALE, options).format(value);
}
