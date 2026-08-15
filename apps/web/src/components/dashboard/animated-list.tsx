"use client";

import { isValidElement } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "framer-motion";

/**
 * Reuse the caller's key so a reorder or filter keeps each wrapper attached to
 * its own child. Callers that render keyless children fall back to the index.
 */
function childKey(child: React.ReactNode, index: number) {
  return isValidElement(child) && child.key !== null ? child.key : index;
}

interface AnimatedListProps {
  children: React.ReactNode[];
  className?: string;
  /** Unique key prefix to trigger re-animation on page change */
  pageKey?: string | number;
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.04,
      duration: 0.25,
      ease: "easeOut" as const,
    },
  }),
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15 },
  },
};

/** Animated wrapper for generic lists - wraps each child in a motion.div */
export function AnimatedList({
  children,
  className = "",
  pageKey = "default",
}: AnimatedListProps) {
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        <m.div
          key={pageKey}
          className={className}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children.map((child, i) => (
            <m.div
              key={childKey(child, i)}
              custom={i}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {child}
            </m.div>
          ))}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}

interface AnimatedGridProps extends AnimatedListProps {
  /** Forwarded to the grid container so callers can measure the laid-out grid. */
  ref?: React.Ref<HTMLDivElement>;
}

/** Animated grid for card layouts - wraps each child in a motion.div */
export function AnimatedGrid({
  children,
  className = "",
  pageKey = "default",
  ref,
}: AnimatedGridProps) {
  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence mode="wait">
        <m.div
          ref={ref}
          key={pageKey}
          className={className}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children.map((child, i) => (
            <m.div
              key={childKey(child, i)}
              custom={i}
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {child}
            </m.div>
          ))}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}

// Table-row stagger now lives in CSS: use the `animate-row-in` class
// (globals.css) with an inline animationDelay — no framer-motion needed.
