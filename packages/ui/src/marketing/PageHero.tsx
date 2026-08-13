import type { ReactNode } from "react";
import { terminal } from "../terminal/tokens";

/**
 * Sub-page hero in the landing page's language: mono eyebrow line, big sans
 * title, sans lede — same shell width and glow as the landing hero.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-14rem] left-1/2 h-[30rem] w-[60rem] -translate-x-1/2 opacity-[0.14]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34,197,94,0.55), transparent 72%)",
          filter: "blur(70px)",
        }}
      />
      <div className={`${terminal.shell} relative pt-20 pb-14 sm:pt-24`}>
        <p
          className={`${terminal.mono} text-[12px] tracking-[0.18em] text-ink-faint uppercase`}
        >
          envpilot — {eyebrow}
        </p>
        <h1 className="mt-6 max-w-3xl font-sans text-[clamp(2.25rem,5.5vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-ink [text-wrap:balance]">
          {title}
        </h1>
        {description && (
          <p className="mt-6 max-w-2xl font-sans text-[17px] leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
