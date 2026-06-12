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
      className={`relative rounded-xl bg-gradient-to-b from-green-500/25 via-zinc-700/30 to-zinc-800/30 p-px ${
        glow ? "shadow-[0_0_80px_-16px_rgba(34,197,94,0.35)]" : "shadow-2xl"
      } ${className}`}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[11px] bg-zinc-950/95 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/60 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-500/80 transition-colors" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-2 truncate font-mono text-xs text-zinc-500">
            {title}
          </span>
          <span className="ml-auto hidden items-center gap-1 rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 sm:flex">
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
