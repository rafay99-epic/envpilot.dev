/**
 * Hosts the Next image optimizer is allowed to fetch from.
 *
 * Imported by `next.config.ts` to build `images.remotePatterns` and by
 * `isOptimizableImageHost` at runtime, so the build config and the render-time
 * decision cannot drift apart. Widening this list points our optimizer at a
 * new origin, so add a host only when we control or trust it.
 */
export const OPTIMIZED_IMAGE_HOSTS = [
  "workos.com",
  "workoscdn.com",
  "googleusercontent.com",
  "githubusercontent.com",
  "svgl.app",
] as const;

/** Both the bare host and its subdomains, in the shape `images` expects. */
export const remoteImagePatterns = OPTIMIZED_IMAGE_HOSTS.flatMap(
  (hostname) =>
    [
      { protocol: "https", hostname },
      { protocol: "https", hostname: `**.${hostname}` },
    ] as const
);

/**
 * Whether the optimizer will accept this URL.
 *
 * Organization logos are stored as any URL an owner pastes, so a logo can live
 * on a host we have never allowlisted. The optimizer rejects those: it throws
 * in development and returns a 400 in production, which renders as a broken
 * image. Callers use this to fall back to an unoptimized render instead.
 */
export function isOptimizableImageHost(src: string): boolean {
  if (!URL.canParse(src)) return false;
  const { hostname, protocol } = new URL(src);
  if (protocol !== "https:") return false;
  return OPTIMIZED_IMAGE_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`)
  );
}
