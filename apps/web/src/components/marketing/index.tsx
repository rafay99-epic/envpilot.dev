import type { ReactNode } from "react";
import {
  MarketingShell as UIMarketingShell,
  SITE_URLS,
  type NavLink,
  type FooterColumn,
} from "@envpilot/ui";
import { PublicHeaderButtons } from "@/components/landing/PublicHeaderButtons";

// Re-export the rest of the shared UI package unchanged. MarketingShell below
// shadows the package's Shell with a web-wired version that injects this
// app's nav links, footer links, and auth buttons.
export * from "@envpilot/ui";

// Nav destinations. docs + blog point at their subdomains; the rest stay
// in-app.
const NAV_LINKS: NavLink[] = [
  { label: "features", href: "/#features" },
  { label: "pricing", href: "/pricing" },
  { label: "docs", href: SITE_URLS.docs },
  { label: "blog", href: SITE_URLS.blog },
  { label: "changelog", href: "/changelog" },
  { label: "wishlist", href: "/wishlist" },
  { label: "faq", href: "/faq" },
];

// Footer link columns. /docs/* destinations resolve against the docs subdomain.
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Wishlist", href: "/wishlist" },
    ],
  },
  {
    title: "resources",
    links: [
      { label: "Getting Started", href: `${SITE_URLS.docs}/start/quickstart` },
      { label: "CLI Reference", href: `${SITE_URLS.docs}/cli/overview` },
      {
        label: "VS Code Extension",
        href: `${SITE_URLS.docs}/extension/overview`,
      },
      { label: "Security", href: `${SITE_URLS.docs}/platform/security` },
      { label: "Brand Assets", href: "/logo" },
      { label: "Source (GitHub)", href: SITE_URLS.github, external: true },
    ],
  },
  {
    title: "compare",
    links: [
      { label: "vs Doppler", href: "/vs/doppler" },
      { label: "vs Infisical", href: "/vs/infisical" },
      { label: "vs .env files", href: "/vs/dotenv" },
    ],
  },
  {
    title: "support",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Support", href: "/support" },
      { label: "Contact", href: "/contact" },
      { label: "Docs", href: SITE_URLS.docs },
      {
        label: "Status",
        href: "https://stats.uptimerobot.com/FxXv9XmG1h",
        external: true,
      },
    ],
  },
  {
    title: "legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export function MarketingShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <UIMarketingShell
      className={className}
      navLinks={NAV_LINKS}
      navActions={<PublicHeaderButtons />}
      footerColumns={FOOTER_COLUMNS}
      statusUrl="/api/status"
    >
      {children}
    </UIMarketingShell>
  );
}
