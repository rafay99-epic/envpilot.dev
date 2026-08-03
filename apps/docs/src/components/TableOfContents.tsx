"use client";

import { useEffect, useState } from "react";
import type { DocHeading } from "@/lib/headings";

/**
 * "On this page" rail with scroll-spy.
 *
 * IntersectionObserver over the rendered headings — no scroll handler, no
 * measurement math. The topmost heading currently intersecting the upper
 * third of the viewport wins.
 */
export function TableOfContents({ headings }: { headings: DocHeading[] }) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -66% 0px" }
    );

    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [headings]);

  return (
    <nav className="sticky top-24">
      <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-green-400">
        <span className="h-1 w-1 rounded-full bg-green-400" />
        {"// on this page"}
      </p>
      <ul className="mt-4 space-y-2 border-l border-zinc-800/60">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? "true" : undefined}
                className={`-ml-px block border-l text-xs leading-relaxed transition-colors ${
                  active
                    ? "border-green-400 text-green-400"
                    : "border-transparent text-zinc-500 hover:border-green-500/60 hover:text-zinc-200"
                } ${heading.depth === 3 ? "pl-6" : "pl-3"}`}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
