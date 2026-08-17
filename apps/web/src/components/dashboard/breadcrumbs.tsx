"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Back arrow plus a breadcrumb trail.
 *
 * The two answer different questions and that is why both are here. The arrow
 * goes back where you CAME from, which is the only correct destination when
 * you arrived from search or the command palette. The crumbs go up the tree,
 * which the arrow cannot do and which is what you want when you landed on a
 * deep link.
 *
 * The trail is derived from the pathname, so it cannot drift from the routes
 * the way the hardcoded per-page back arrows did.
 */

/** Segments that are structural, not navigable on their own. */
const SKIP = new Set(["dashboard"]);

/** Segment slug to label, where the slug alone reads badly. */
const LABELS: Record<string, string> = {
  projects: "projects",
  organizations: "organizations",
  variables: "variables",
  accounts: "accounts",
  requests: "requests",
  docs: "docs",
  files: "files",
  members: "members",
  settings: "settings",
  shared: "shared",
  trash: "trash",
  new: "new",
};

export type Crumb = { label: string; href?: string; key: string };

function buildCrumbs(pathname: string, overrides?: Crumb[]): Crumb[] {
  if (overrides) return overrides;
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [
    { key: "/dashboard", label: "dashboard", href: "/dashboard" },
  ];
  let href = "";
  for (const part of parts) {
    href += `/${part}`;
    if (SKIP.has(part)) continue;
    // The accumulated path is unique per level and stable across renders,
    // which the array index is not once a trail gains or loses a segment.
    crumbs.push({
      key: href,
      label: LABELS[part] ?? decodeURIComponent(part),
      href,
    });
  }
  // The last crumb is where you already are, so it is not a link.
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;
  return crumbs;
}

export function Breadcrumbs({
  /** Supply when a segment should read as a name rather than its slug. */
  crumbs: overrides,
  className = "",
}: {
  crumbs?: Crumb[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname ?? "", overrides);

  // Nothing to go up to from the dashboard root.
  if (crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex min-w-0 items-center gap-2.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Go back"
        title="Back"
        className="rounded-md border p-1 transition-colors border-line text-ink-faint hover:bg-surface-hover hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <span aria-hidden="true" className="h-3.5 w-px bg-line-strong" />
      {/* Scrolls rather than wraps or clips. A deep trail (project / docs /
          a-long-doc-slug) is wider than a phone, and the tail is the part
          that matters, so it stays reachable instead of being cut off. The
          scrollbar is hidden, matching the category chip rows. */}
      <ol className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap font-mono text-[11.5px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {crumbs.map((crumb, i) => (
          <li key={crumb.key} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-ink-faint">
                /
              </span>
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-ink-faint transition-colors hover:text-ink"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
