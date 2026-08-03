import type { ReactNode } from "react";
import {
  MarketingShell,
  SITE_URLS,
  type NavLink,
  type FooterColumn,
} from "@envpilot/ui";

// Nav destinations. `docs` stays root-relative (we ARE the docs subdomain);
// everything else resolves against the marketing/www site.
const NAV_LINKS: NavLink[] = [
  { label: "features", href: `${SITE_URLS.www}/#features` },
  { label: "pricing", href: `${SITE_URLS.www}/pricing` },
  { label: "docs", href: "/" },
  { label: "blog", href: SITE_URLS.blog },
  { label: "changelog", href: `${SITE_URLS.www}/changelog` },
  { label: "wishlist", href: `${SITE_URLS.www}/wishlist` },
  { label: "faq", href: `${SITE_URLS.www}/faq` },
];

// Footer link columns. In-app docs links are relative; everything else
// resolves against the www marketing site.
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
      { label: "Getting Started", href: "/start/quickstart" },
      { label: "CLI Reference", href: "/cli/overview" },
      { label: "VS Code Extension", href: "/extension/overview" },
      { label: "Security", href: "/platform/security" },
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
      { label: "Docs", href: "/" },
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

function NavActions() {
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

export function DocsShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <MarketingShell
      className={className}
      navLinks={NAV_LINKS}
      navActions={<NavActions />}
      footerColumns={FOOTER_COLUMNS}
    >
      {children}
    </MarketingShell>
  );
}
