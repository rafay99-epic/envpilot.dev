"use client";

import { useSyncExternalStore } from "react";

import { SERVER_TIME_ZONE } from "@/lib/format";

// The visitor's zone never changes mid-session, so there is nothing to
// subscribe to. useSyncExternalStore is here for its server snapshot, not for
// its subscription.
const noSubscribe = () => () => {};

const clientTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const serverTimeZone = () => SERVER_TIME_ZONE;

/**
 * The visitor's IANA time zone, or UTC during server render and hydration.
 *
 * Server render and the hydrating client render both read the server
 * snapshot, so the markup matches; React then re-renders with the real zone.
 * Pair with the helpers in `lib/format.ts` so a timestamp still reads in local
 * time without the server and the browser disagreeing about what it says.
 */
export function useTimeZone() {
  return useSyncExternalStore(noSubscribe, clientTimeZone, serverTimeZone);
}
