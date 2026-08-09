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

  const last = items.length - 1;
  const index = last < 0 ? 0 : Math.min(active, last);
  const current = items[index];

  const onKeyDown = (e: KeyboardEvent) => {
    if (last < 0) return;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  if (!current) return null;

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={`flex flex-wrap gap-x-6 gap-y-2 border-b ${terminal.line} pb-px`}
      >
        {items.map((item, i) => {
          const selected = i === index;

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
