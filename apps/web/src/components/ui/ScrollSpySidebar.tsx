"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface Section {
  id: string;
  label: string;
}

interface ScrollSpySidebarProps {
  sections: Section[];
  defaultActive?: string;
}

/**
 * Sticky left-rail table of contents with scroll-spy highlighting.
 * A vertical track line runs alongside the items; the active item gets a
 * glowing green segment on the track (animated between items via
 * framer-motion layout animation) plus green text. Items are numbered in
 * mono (01, 02, …).
 */
export function ScrollSpySidebar({
  sections,
  defaultActive,
}: ScrollSpySidebarProps) {
  const [activeSection, setActiveSection] = useState(
    defaultActive ?? sections[0]?.id ?? ""
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="On this page" className="hidden lg:block">
      <div className="sticky top-24">
        <p className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          <span className="text-accent">&#10095;</span> on this page
        </p>
        <div className="relative">
          {/* Vertical track line */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-px bg-surface-raised/70"
          />
          <ul>
            {sections.map((s, i) => {
              const isActive = activeSection === s.id;
              return (
                <li key={s.id} className="relative">
                  {isActive && (
                    <motion.span
                      layoutId="scrollspy-active-segment"
                      aria-hidden
                      className="absolute inset-y-1 left-0 w-px bg-accent shadow-[0_0_8px_rgba(34,197,94,0.55)]"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 32,
                      }}
                    />
                  )}
                  <a
                    href={`#${s.id}`}
                    className={`group flex items-baseline gap-2 py-1.5 pl-4 text-xs transition-colors duration-200 ${
                      isActive
                        ? "text-accent"
                        : "text-ink-faint hover:text-ink-muted"
                    }`}
                  >
                    <span
                      className={`font-mono text-[10px] tabular-nums transition-colors duration-200 ${
                        isActive
                          ? "text-accent"
                          : "text-ink-faint group-hover:text-ink-subtle"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">{s.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
