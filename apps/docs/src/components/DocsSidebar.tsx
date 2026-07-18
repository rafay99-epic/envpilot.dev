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
  type LucideIcon,
} from "lucide-react";

/**
 * Shared icon map for docs frontmatter `icon` keys.
 * Used by the sidebar items and the article header.
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
  description?: string;
}

export function DocsSidebar({
  items,
  activeSlug,
}: {
  items: SidebarItem[];
  activeSlug: string;
}) {
  return (
    <>
      {/* ── Desktop sticky rail ───────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <nav aria-label="Documentation" className="sticky top-24">
          <p className="flex items-center gap-2 px-3 font-mono text-[11px] tracking-widest text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
            {"// documentation"}
          </p>

          <ul className="mt-4 space-y-1">
            {items.map((item) => {
              const active = item.slug === activeSlug;
              const Icon = DOC_ICONS[item.icon] ?? DOC_ICONS["file-text"];
              return (
                <li key={item.slug} className="relative">
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-green-400"
                    />
                  )}
                  <Link
                    href={`/${item.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-green-500/5 text-green-400"
                        : "text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>

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

      {/* ── Mobile: horizontal scrollable pill row ────────────────── */}
      <nav
        aria-label="Documentation"
        className="-mx-4 w-auto px-4 sm:-mx-6 sm:px-6 lg:hidden"
      >
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const active = item.slug === activeSlug;
            const Icon = DOC_ICONS[item.icon] ?? DOC_ICONS["file-text"];
            return (
              <Link
                key={item.slug}
                href={`/${item.slug}`}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.title}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
