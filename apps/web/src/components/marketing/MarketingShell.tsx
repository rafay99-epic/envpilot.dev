import type { ReactNode } from "react";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";

/**
 * Standard wrapper for every public marketing page: dark canvas, shared
 * nav and footer. Pages render their sections as children.
 */
export function MarketingShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative min-h-screen bg-zinc-950 font-mono text-zinc-300 antialiased ${className}`}
    >
      <MarketingNav />
      <main className="relative pt-16">{children}</main>
      <MarketingFooter />
    </div>
  );
}
