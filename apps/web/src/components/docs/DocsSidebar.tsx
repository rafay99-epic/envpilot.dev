import Link from "next/link";
import {
  Terminal,
  Monitor,
  Puzzle,
  Rocket,
  Shield,
  Users,
  FileText,
  ExternalLink,
  BookOpen,
} from "lucide-react";

const ICON_MAP: Record<string, React.ReactNode> = {
  "chevron-right": <Rocket className="h-3.5 w-3.5" />,
  terminal: <Terminal className="h-3.5 w-3.5" />,
  puzzle: <Puzzle className="h-3.5 w-3.5" />,
  monitor: <Monitor className="h-3.5 w-3.5" />,
  shield: <Shield className="h-3.5 w-3.5" />,
  users: <Users className="h-3.5 w-3.5" />,
  "file-text": <FileText className="h-3.5 w-3.5" />,
};

interface SidebarItem {
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
      {/* ── Desktop sidebar ───────────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <nav className="sticky top-20 space-y-0.5">
          <div className="mb-5 flex items-center gap-2 px-3">
            <BookOpen className="h-4 w-4 text-green-400" />
            <span className="text-sm font-semibold text-zinc-100">Docs</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
              v1
            </span>
          </div>

          {items.map((item) => {
            const active = item.slug === activeSlug;
            return (
              <Link
                key={item.slug}
                href={`/docs/${item.slug}`}
                className={`flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-green-400 bg-green-500/10 text-green-400"
                    : "border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {ICON_MAP[item.icon] ?? ICON_MAP["file-text"]}
                {item.title}
              </Link>
            );
          })}

          <div className="mt-6 border-t border-zinc-800/50 pt-4">
            <a
              href="https://github.com/rafay99-epic/envpilot.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <ExternalLink className="h-3 w-3" />
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@envpilot/cli"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <ExternalLink className="h-3 w-3" />
              npm
            </a>
            <a
              href="https://marketplace.visualstudio.com/items?itemName=envpilot.envpilot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <ExternalLink className="h-3 w-3" />
              VS Code Marketplace
            </a>
          </div>
        </nav>
      </aside>

      {/* ── Mobile pills ─────────────────────────────────────────── */}
      <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
        {items.map((item) => {
          const active = item.slug === activeSlug;
          return (
            <Link
              key={item.slug}
              href={`/docs/${item.slug}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border border-green-500/30 bg-green-500/10 text-green-400"
                  : "border border-zinc-800 bg-zinc-900 text-zinc-500"
              }`}
            >
              {item.title}
            </Link>
          );
        })}
      </div>
    </>
  );
}
