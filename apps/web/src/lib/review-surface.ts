/**
 * Recorded on review audit rows so approvals made from a phone can be
 * counted later. Viewport width is the only signal worth having: a
 * user agent is a lie and an installed PWA is still the same page.
 */
export function reviewSurface(): "mobile" | "desktop" {
  return typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
    ? "mobile"
    : "desktop";
}
