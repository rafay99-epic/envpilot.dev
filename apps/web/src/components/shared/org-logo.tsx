import Image from "next/image";
import { isOptimizableImageHost } from "@/lib/image-hosts";

interface OrgLogoProps {
  src: string;
  /** The organization name, which is what the logo stands in for. */
  alt: string;
  /** Rendered edge length in pixels. Logos are always square. */
  size: number;
  className?: string;
}

/**
 * An organization's logo.
 *
 * Exists so the optimizer decision lives in one place: `logoUrl` is whatever
 * URL an owner pasted, and a host missing from `remotePatterns` renders as a
 * broken image rather than degrading. Off-allowlist hosts therefore render
 * unoptimized, which still gives lazy loading and reserved layout space.
 */
export function OrgLogo({ src, alt, size, className }: OrgLogoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      unoptimized={!isOptimizableImageHost(src)}
    />
  );
}
