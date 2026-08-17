"use client";

import { useSyncExternalStore } from "react";

// The platform cannot change mid-session, so there is nothing to subscribe
// to. useSyncExternalStore is here for its server snapshot, not for its
// subscription.
const noSubscribe = () => () => {};

const readPlatform = () => /Mac/.test(navigator.userAgent);

const serverPlatform = () => false;

/**
 * True when the visitor is on a Mac, for picking between the Command glyphs
 * and the Ctrl labels in shortcut hints.
 *
 * `navigator` does not exist on the server, so a component cannot read it
 * during render without guaranteeing a hydration mismatch. Reading it from an
 * effect avoids the mismatch but flips the label after the first paint, which
 * every Mac user sees. The server snapshot keeps SSR and hydration agreeing on
 * the Ctrl label, and React swaps in the real value as part of the hydration
 * commit rather than in a post-paint effect.
 */
export function useIsMacPlatform() {
  return useSyncExternalStore(noSubscribe, readPlatform, serverPlatform);
}
