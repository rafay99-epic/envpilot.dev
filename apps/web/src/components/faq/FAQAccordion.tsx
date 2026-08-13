import { terminal } from "@/components/marketing";

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

/** Native disclosure — no state, no motion library, same look as the landing FAQ. */
export function FAQAccordion({ sections }: { sections: FAQSection[] }) {
  return (
    <div className="min-w-0 flex-1 space-y-14">
      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-24">
          <div className="flex items-baseline gap-3">
            <span className={`${terminal.mono} text-[12px] text-accent`}>
              {String(section.n).padStart(2, "0")}
            </span>
            <h2 className="font-sans text-[22px] font-semibold tracking-[-0.02em] text-ink">
              {section.title}
            </h2>
          </div>

          <div
            className={`mt-5 divide-y divide-line border-y ${terminal.line}`}
          >
            {section.items.map((item) => (
              <details key={item.question} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-[16px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span
                    aria-hidden
                    className={`${terminal.mono} shrink-0 text-ink-faint transition-transform group-open:rotate-45`}
                  >
                    +
                  </span>
                </summary>
                <div className="mt-3 max-w-2xl font-sans text-[16px] leading-relaxed text-ink-muted">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
