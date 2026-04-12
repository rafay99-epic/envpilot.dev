"use client";

import { useState, useEffect } from "react";

interface Section {
  id: string;
  label: string;
}

interface ScrollSpySidebarProps {
  sections: Section[];
  defaultActive?: string;
}

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
    <nav className="hidden w-48 shrink-0 lg:block">
      <div className="sticky top-20">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-zinc-600">
          on this page
        </p>
        <ul className="space-y-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`block py-1 text-xs transition-colors ${
                  activeSection === s.id
                    ? "text-green-400"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {activeSection === s.id && <span className="mr-1">&gt;</span>}
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
