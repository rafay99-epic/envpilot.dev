"use client";

import type { ReactNode } from "react";
import { Reveal } from "./motion";

/**
 * Standard section header: mono eyebrow chip + large sans-serif title +
 * optional description. The sans title against mono body text is the core
 * typographic move of the marketing redesign.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  const alignClasses =
    align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <Reveal className={`flex flex-col ${alignClasses} ${className}`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 font-mono text-[11px] tracking-widest text-green-400">
        <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
        {`// ${eyebrow}`}
      </span>
      <h2 className="mt-4 max-w-3xl font-sans text-3xl font-bold tracking-tight text-zinc-100 md:text-5xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-zinc-500">
          {description}
        </p>
      )}
    </Reveal>
  );
}
