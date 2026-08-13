"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Reveal } from "@/components/marketing";

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

interface FAQSection {
  id: string;
  n: number;
  title: string;
  items: FAQItem[];
}

export function FAQAccordion({ sections }: { sections: FAQSection[] }) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggleItem(key: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="min-w-0 flex-1 space-y-10 text-sm leading-relaxed text-ink-muted">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <Reveal className="rounded-xl border border-line bg-surface/40 p-5 backdrop-blur-sm sm:p-6">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-accent">
                {String(section.n).padStart(2, "0")}
              </span>
              <h2 className="font-sans text-lg font-semibold tracking-tight text-ink">
                {section.title}
              </h2>
            </div>

            <div className="mt-5 space-y-2.5">
              {section.items.map((item, idx) => {
                const itemKey = `${section.id}-${idx}`;
                const isOpen = openItems.has(itemKey);
                return (
                  <div
                    key={itemKey}
                    className={`overflow-hidden rounded-xl border transition-colors duration-300 ${
                      isOpen
                        ? "border-accent-line bg-accent/[0.04]"
                        : "border-line bg-canvas/40 hover:border-accent-line"
                    }`}
                  >
                    <button
                      onClick={() => toggleItem(itemKey)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-hover/40"
                    >
                      <motion.span
                        aria-hidden
                        animate={{ rotate: isOpen ? 90 : 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="shrink-0 font-mono text-xs text-accent"
                      >
                        ❯
                      </motion.span>
                      <span
                        className={`font-sans text-sm font-semibold transition-colors ${
                          isOpen ? "text-accent" : "text-ink"
                        }`}
                      >
                        {item.question}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="answer"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-line px-4 py-4 pl-10 font-mono text-sm leading-relaxed text-ink-muted">
                            {item.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </section>
      ))}
    </div>
  );
}
