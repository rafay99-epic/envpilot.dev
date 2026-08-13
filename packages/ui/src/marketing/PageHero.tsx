"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { AuroraGlow, GridLines, Noise } from "./backgrounds";
import { fadeUp, staggerContainer } from "./motion";

/**
 * Compact hero for sub-pages (pricing, docs, legal, etc.): eyebrow chip,
 * big sans title, description — over the shared aurora/grid backdrop.
 */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  align?: "left" | "center";
}) {
  const alignClasses =
    align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <section className="relative overflow-hidden">
      <AuroraGlow />
      <GridLines />
      <Noise />
      <motion.div
        className={`relative z-10 mx-auto flex max-w-4xl flex-col px-4 pt-20 pb-16 sm:px-6 ${alignClasses}`}
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 py-1 font-mono text-[11px] tracking-widest text-accent"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
          {`// ${eyebrow}`}
        </motion.span>
        <motion.h1
          variants={fadeUp}
          className="mt-5 font-sans text-4xl font-bold tracking-tight text-ink md:text-6xl"
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-ink-subtle md:text-base"
          >
            {description}
          </motion.p>
        )}
        {children && (
          <motion.div variants={fadeUp} className="mt-8">
            {children}
          </motion.div>
        )}
      </motion.div>
    </section>
  );
}
