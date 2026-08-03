import type { ReactNode } from "react";
import {
  MarketingShell as UIMarketingShell,
  SITE_URLS,
  type NavLink,
  type FooterColumn,
} from "@envpilot/ui";

// Nav destinations, from the blog's perspective: everything except "blog"
// itself points back at the main app (or its own subdomain for docs).
const NAV_LINKS: NavLink[] = [
  { label: "features", href: `${SITE_URLS.www}/#features` },
  { label: "pricing", href: `${SITE_URLS.www}/pricing` },
  { label: "docs", href: SITE_URLS.docs },
  { label: "blog", href: "/" },
  { label: "changelog", href: `${SITE_URLS.www}/changelog` },
  { label: "wishlist", href: `${SITE_URLS.www}/wishlist` },
  { label: "faq", href: `${SITE_URLS.www}/faq` },
];

// Footer link columns — every in-app path resolves against the main app
// (cross-origin), docs links stay on the docs subdomain.
const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "product",
    links: [
      { label: "Features", href: `${SITE_URLS.www}/#features` },
      { label: "Pricing", href: `${SITE_URLS.www}/pricing` },
      { label: "Changelog", href: `${SITE_URLS.www}/changelog` },
      { label: "Wishlist", href: `${SITE_URLS.www}/wishlist` },
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
    ],
  },
  {
    title: "compare",
    links: [
      { label: "vs Doppler", href: `${SITE_URLS.www}/vs/doppler` },
      { label: "vs Infisical", href: `${SITE_URLS.www}/vs/infisical` },
      { label: "vs .env files", href: `${SITE_URLS.www}/vs/dotenv` },
    ],
  },
  {
    title: "support",
    links: [
      { label: "FAQ", href: `${SITE_URLS.www}/faq` },
      { label: "Support", href: `${SITE_URLS.www}/support` },
      { label: "Contact", href: `${SITE_URLS.www}/contact` },
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
      { label: "Privacy Policy", href: `${SITE_URLS.www}/privacy` },
      { label: "Terms of Service", href: `${SITE_URLS.www}/terms` },
    ],
  },
];

// Signed-out header actions, inlined from the web app's PublicHeaderButtons
// (signed-out branch only — the blog has no auth context of its own).
// Plain <a> tags since these are cross-origin links to the main app.
function BlogHeaderActions() {
  return (
    <>
      <a
        href={`${SITE_URLS.www}/sign-in`}
        className="text-xs text-zinc-500 transition-colors hover:text-green-400"
      >
        sign-in
      </a>
      <a
        href={`${SITE_URLS.www}/sign-up`}
        className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
      >
        get-started
      </a>
    </>
  );
}

export function BlogShell({
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
      navActions={<BlogHeaderActions />}
      footerColumns={FOOTER_COLUMNS}
    >
      {children}
    </UIMarketingShell>
  );
}
