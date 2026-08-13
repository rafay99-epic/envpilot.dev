import type { ReactNode } from "react";

/**
 * The signature container of the redesign: a terminal window with a
 * gradient hairline border, traffic lights, and an optional green glow.
 * Server-safe — no client APIs.
 */
export function TerminalFrame({
  title,
  children,
  className = "",
  bodyClassName = "",
  glow = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`relative rounded-xl bg-gradient-to-b from-accent-line via-line to-line p-px ${
        glow ? "shadow-[0_0_80px_-16px_rgba(34,197,94,0.35)]" : "shadow-2xl"
      } ${className}`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[11px] bg-canvas/95 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-line bg-surface/60 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-danger-soft transition-colors" />
          <span className="h-3 w-3 rounded-full bg-warning-soft" />
          <span className="h-3 w-3 rounded-full bg-accent-soft" />
          <span className="ml-2 truncate font-mono text-xs text-ink-subtle">
            {title}
          </span>
          <span className="ml-auto hidden items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint sm:flex">
            aes-256-gcm
          </span>
        </div>
        <div
          className={`relative flex-1 p-5 font-mono text-sm leading-relaxed ${bodyClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
