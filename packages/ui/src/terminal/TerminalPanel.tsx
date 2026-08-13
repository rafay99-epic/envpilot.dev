import type { ReactNode } from "react";
import { terminal } from "./tokens";

export function TerminalPanel({
  title,
  meta,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`${terminal.panel} overflow-hidden ${className}`}>
      {title && (
        <div
          className={`flex items-center gap-3 border-b ${terminal.line} bg-white/[0.02] px-4 py-2`}
        >
          <span
            className={`${terminal.mono} truncate text-[11.5px] text-ink-muted`}
          >
            {title}
          </span>
          {meta && (
            <span
              className={`${terminal.mono} ml-auto hidden shrink-0 text-[11px] text-ink-faint sm:block`}
            >
              {meta}
            </span>
          )}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function TerminalCommand({
  cmd,
  comment,
  className = "",
}: {
  cmd: string;
  comment?: string;
  className?: string;
}) {
  return (
    <header className={`max-w-3xl ${className}`}>
      <h2
        className={`${terminal.mono} text-[clamp(1.25rem,2.8vw,1.75rem)] leading-snug tracking-tight text-ink`}
      >
        <span aria-hidden className="mr-3 text-accent">
          ❯
        </span>
        {cmd}
      </h2>
      {comment && (
        <p
          className={`${terminal.mono} mt-3 text-[13px] leading-relaxed text-ink-subtle`}
        >
          <span aria-hidden className="mr-1.5 text-ink-faint">
            #
          </span>
          {comment}
        </p>
      )}
    </header>
  );
}
