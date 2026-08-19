import Link from "next/link";
import { Terminal } from "lucide-react";

/**
 * The sidebar frame with no links.
 *
 * The nav's contents are derived from the URL (active item, and the whole
 * project section on /dashboard/projects/[slug]/*), so on a route with a
 * dynamic segment it can't be prerendered. This holds its exact width and
 * chrome so the shell paints at final size and the links fill in on hydration
 * rather than shifting the page.
 */
export function DashboardNavFallback() {
  return (
    <aside className="relative z-20 hidden w-60 shrink-0 border-r border-line bg-chrome md:block">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center border-b border-line px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-mono"
          >
            <Terminal className="h-5 w-5 shrink-0 text-accent" />
            <span className="text-sm font-semibold text-ink">
              <span className="text-accent">$</span> envpilot
            </span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
