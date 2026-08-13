import { terminal } from "./tokens";

export interface PageSection {
  id: string;
  n: string;
  label: string;
  status: string;
}

export function SectionRuler({
  sections,
  active,
}: {
  sections: readonly PageSection[];
  active: number;
}) {
  return (
    <nav
      aria-label="Page sections"
      className="fixed top-1/2 left-5 z-40 hidden -translate-y-1/2 flex-col gap-2.5 xl:flex"
    >
      {sections.map((section, i) => {
        const isActive = i === active;

        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="group flex items-center gap-2.5"
            aria-current={isActive ? "true" : undefined}
          >
            <span
              aria-hidden
              className={`h-px transition-all duration-300 ${
                isActive
                  ? "w-6 bg-accent"
                  : "w-3 bg-surface-hover group-hover:w-5"
              }`}
            />
            <span
              className={`${terminal.mono} text-[10px] tracking-[0.14em] transition-colors ${
                isActive
                  ? "text-accent"
                  : "text-ink-faint group-hover:text-ink-muted"
              }`}
            >
              {section.n} {section.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}

export function SectionStatusBar({
  sections,
  active,
  brand,
}: {
  sections: readonly PageSection[];
  active: number;
  brand: string;
}) {
  const section = sections[active];

  return (
    <div
      aria-hidden
      className={`fixed inset-x-0 bottom-0 z-50 border-t ${terminal.line} bg-chrome/90 backdrop-blur-md`}
    >
      <div
        className={`${terminal.shell} flex h-9 items-center gap-3 ${terminal.mono} text-[11px] tracking-wide`}
      >
        <span className="flex items-center gap-2 bg-accent-soft px-2 py-0.5 text-accent">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          {brand}
        </span>
        <span className="truncate text-ink-muted">{section.status}</span>
        <span className="ml-auto hidden shrink-0 text-ink-faint sm:block">
          {section.n}/{sections.length - 1}
        </span>
      </div>
    </div>
  );
}
