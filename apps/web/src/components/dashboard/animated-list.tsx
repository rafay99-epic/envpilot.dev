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

/** Animated grid for card layouts - wraps each child in a motion.div */
export function AnimatedGrid({
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

/**
 * Staggered animation variants for table rows.
 * Use with motion.tr directly in your row components.
 *
 * Usage:
 *   <motion.tr {...staggeredRow(index)}> ... </motion.tr>
 */
export const staggeredRow = (index: number) => ({
  custom: index,
  variants: itemVariants,
  initial: "hidden" as const,
  animate: "visible" as const,
});
