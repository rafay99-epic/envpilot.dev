import type { ElementType, ReactNode } from "react";

export interface PageHeaderProps {
  /** Lucide icon. Ignored when `leading` is given. */
  icon?: ElementType;
  /** Rendered mark for pages whose icon is data (project colour, org logo). */
  leading?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /**
   * Mono command line above the title, matching the landing page's `❯ cmd`
   * treatment — e.g. "envpilot usage". Pages that map to a real CLI command
   * should set it; the rest read fine without.
   */
  cmd?: string;
}

/**
 * Standard page heading, shared by the dashboard (Next) and admin (Vite) —
 * separate builds, hence a package rather than an app component.
 *
 * The icon sits on the title's line only. Putting it in a flex row beside a
 * title+description column centres it against the pair, landing it in the gap
 * between them — the bug every page had before this existed.
 */
export function PageHeader({
  icon: Icon,
  leading,
  title,
  description,
  actions,
  cmd,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {cmd ? (
          <p className="mb-2 truncate font-mono text-[13px] leading-snug text-ink-muted">
            <span aria-hidden className="mr-2.5 text-accent">
              ❯
            </span>
            {cmd}
          </p>
        ) : null}
        <div className="flex items-center gap-2.5">
          {leading ??
            (Icon ? (
              <Icon className="h-5 w-5 shrink-0 text-accent/70" />
            ) : null)}
          <h1 className="truncate text-2xl leading-none font-bold text-ink">
            {title}
          </h1>
        </div>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
