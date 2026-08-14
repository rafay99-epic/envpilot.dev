"use client";

import { motion, AnimatePresence } from "framer-motion";

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
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        className={className}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {children.map((child, i) => (
          <motion.div
            key={i}
            custom={i}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {child}
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
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
    <AnimatePresence mode="wait">
      <motion.div
        ref={ref}
        key={pageKey}
        className={className}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {children.map((child, i) => (
          <motion.div
            key={i}
            custom={i}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {child}
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

// Table-row stagger now lives in CSS: use the `animate-row-in` class
// (globals.css) with an inline animationDelay — no framer-motion needed.
