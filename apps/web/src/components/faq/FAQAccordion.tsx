"use client";

import { useState } from "react";

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
    <div className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-400">
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className="scroll-mt-24 border-b border-zinc-800/50 py-8 first:pt-0 last:border-b-0"
        >
          <h2 className="text-base font-semibold text-zinc-100">
            <span className="text-green-500">
              {String(section.n).padStart(2, "0")}.
            </span>{" "}
            {section.title}
          </h2>
          <div className="mt-4">
            <div className="space-y-2">
              {section.items.map((item, idx) => {
                const itemKey = `${section.id}-${idx}`;
                const isOpen = openItems.has(itemKey);
                return (
                  <div
                    key={itemKey}
                    className="rounded-lg border border-zinc-800/50 bg-zinc-900/30"
                  >
                    <button
                      onClick={() => toggleItem(itemKey)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-zinc-800/30"
                    >
                      <span className="text-sm text-zinc-200">
                        {item.question}
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 text-green-500 transition-transform duration-200 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="border-t border-zinc-800/50 px-4 py-3 text-sm leading-relaxed text-zinc-400">
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
