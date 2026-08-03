import Link from "next/link";
import {
  Terminal,
  Monitor,
  Puzzle,
  Rocket,
  Shield,
  Users,
  FileText,
  Zap,
  BookOpen,
  Plug,
  Github,
  Network,
  Gauge,
  ExternalLink,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { DocsSearch } from "@/components/DocsSearch";

/**
 * Shared icon map for docs frontmatter `icon` keys.
 * Used by the sidebar sections and the article header.
 */
export const DOC_ICONS: Record<string, LucideIcon> = {
  "chevron-right": Rocket,
  terminal: Terminal,
  puzzle: Puzzle,
  monitor: Monitor,
  shield: Shield,
  users: Users,
  "file-text": FileText,
  zap: Zap,
  book: BookOpen,
  plug: Plug,
  github: Github,
  network: Network,
  gauge: Gauge,
};

const RESOURCES = [
  {
    label: "github",
    href: "https://github.com/rafay99-epic/envpilot.dev",
  },
  {
    label: "npm",
    href: "https://www.npmjs.com/package/@envpilot/cli",
  },
  {
    label: "vs code marketplace",
    href: "https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot",
  },
];

export interface SidebarItem {
  slug: string;
  title: string;
  icon: string;
}

export interface SidebarSection {
  slug: string;
  label: string;
  icon: string;
  items: SidebarItem[];
}

function SectionLinks({
  section,
  activeSlug,
}: {
  section: SidebarSection;
  activeSlug: string;
}) {
  return (
    <ul className="mt-1 space-y-0.5 border-l border-zinc-800/70 pl-3">
      {section.items.map((item) => {
        const active = item.slug === activeSlug;
        return (
          <li key={item.slug} className="relative">
            {active && (
              <span
                aria-hidden
                className="absolute -left-[13px] top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-green-400"
              />
            )}
            <Link
              href={`/${item.slug}`}
              aria-current={active ? "page" : undefined}
              className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-green-500/5 text-green-400"
                  : "text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
              }`}
            >
              {item.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Two-level docs navigation.
 *
 * Sections collapse with the native <details> element — the section holding
 * the current page renders `open`, everything else starts closed, and none of
 * it needs client-side state.
 */
export function DocsSidebar({
  sections,
  activeSlug,
}: {
  sections: SidebarSection[];
  activeSlug: string;
}) {
  const activeSection = activeSlug.split("/")[0];

  return (
    <>
      {/* ── Desktop sticky rail ───────────────────────────────────── */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <nav
          aria-label="Documentation"
          className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-1"
        >
          <DocsSearch />

          <Link
            href="/"
            className="mt-4 flex items-center gap-2 px-3 font-mono text-[11px] tracking-widest text-green-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
            {"// documentation"}
          </Link>

          <div className="mt-3 space-y-1">
            {sections.map((section) => {
              const Icon = DOC_ICONS[section.icon] ?? DOC_ICONS["file-text"];
              return (
                <details
                  key={section.slug}
                  open={section.slug === activeSection}
                  className="group"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500 transition-colors marker:content-none hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono">{section.label}</span>
                  </summary>
                  <SectionLinks section={section} activeSlug={activeSlug} />
                </details>
              );
            })}
          </div>

          <div className="mt-8 border-t border-zinc-800/60 pt-4">
            <p className="px-3 font-mono text-[10px] tracking-widest text-zinc-600">
              {"// resources"}
            </p>
            <ul className="mt-2 space-y-0.5">
              {RESOURCES.map((resource) => (
                <li key={resource.href}>
                  <a
                    href={resource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:text-green-400"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {resource.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>

      {/* ── Mobile: search, section pills, then pages of this section ── */}
      <nav aria-label="Documentation" className="w-auto lg:hidden">
        <DocsSearch />

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((section) => {
            const active = section.slug === activeSection;
            const Icon = DOC_ICONS[section.icon] ?? DOC_ICONS["file-text"];
            return (
              <Link
                key={section.slug}
                href={`/${section.items[0].slug}`}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {section.label}
              </Link>
            );
          })}
        </div>

        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections
            .filter((section) => section.slug === activeSection)
            .flatMap((section) => section.items)
            .map((item) => {
              const active = item.slug === activeSlug;
              return (
                <Link
                  key={item.slug}
                  href={`/${item.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                    active
                      ? "bg-green-500/10 text-green-400"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {item.title}
                </Link>
              );
            })}
        </div>
      </nav>
    </>
  );
}
