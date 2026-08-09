"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { terminal } from "./tokens";

export interface TerminalTabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export function TerminalTabs({
  label,
  items,
  className = "",
  panelClassName = "mt-8",
}: {
  label: string;
  items: TerminalTabItem[];
  className?: string;
  panelClassName?: string;
}) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const current = items[active];

  const onKeyDown = (e: KeyboardEvent) => {
    const last = items.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`flex flex-wrap gap-x-6 gap-y-2 border-b ${terminal.line} pb-px`}
      >
        {items.map((item, i) => {
          const selected = i === active;

          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`-mb-px border-b-2 pb-3 ${terminal.mono} text-[13px] transition-colors ${
                selected
                  ? "border-green-400 text-green-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${current.id}`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        tabIndex={0}
        className={panelClassName}
      >
        {current.panel}
      </div>
    </div>
  );
}
