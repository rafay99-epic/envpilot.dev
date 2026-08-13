import type { ReactNode } from "react";
import { terminal } from "../terminal/tokens";

/** Panel-identity card: same surface as the landing sections, brighter ring on hover. */
export function GlowCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`group ${terminal.panel} transition-shadow duration-300 hover:ring-line-strong ${className}`}
    >
      {children}
    </div>
  );
}
