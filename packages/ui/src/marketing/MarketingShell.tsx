import type { ReactNode } from "react";
import { MarketingNav, type NavLink } from "./MarketingNav";
import { MarketingFooter, type FooterColumn } from "./MarketingFooter";

/**
 * Standard wrapper for every public marketing page: dark canvas, shared
 * nav and footer. Pages render their sections as children.
 *
 * Nav/footer content (links, auth actions) is app-specific and forwarded
 * from the caller, keeping the shell free of routing/auth coupling.
 */
export function MarketingShell({
  children,
  className = "",
  navLinks,
  navActions,
  footerColumns,
}: {
  children: ReactNode;
  className?: string;
  navLinks: NavLink[];
  navActions?: ReactNode;
  footerColumns: FooterColumn[];
}) {
  return (
    <div
      className={`relative min-h-screen bg-canvas font-mono text-ink-muted antialiased ${className}`}
    >
      <MarketingNav links={navLinks} actions={navActions} />
      <main className="relative pt-16">{children}</main>
      <MarketingFooter columns={footerColumns} />
    </div>
  );
}
