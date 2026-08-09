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
                  ? "w-6 bg-green-400"
                  : "w-3 bg-zinc-700 group-hover:w-5"
              }`}
            />
            <span
              className={`${terminal.mono} text-[10px] tracking-[0.14em] transition-colors ${
                isActive
                  ? "text-green-400"
                  : "text-zinc-600 group-hover:text-zinc-400"
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
      className={`fixed inset-x-0 bottom-0 z-50 border-t ${terminal.line} bg-[#08090A]/90 backdrop-blur-md`}
    >
      <div
        className={`${terminal.shell} flex h-9 items-center gap-3 ${terminal.mono} text-[11px] tracking-wide`}
      >
        <span className="flex items-center gap-2 bg-green-500/10 px-2 py-0.5 text-green-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
          </span>
          {brand}
        </span>
        <span className="truncate text-zinc-400">{section.status}</span>
        <span className="ml-auto hidden shrink-0 text-zinc-600 sm:block">
          {section.n}/{sections.length - 1}
        </span>
      </div>
    </div>
  );
}
