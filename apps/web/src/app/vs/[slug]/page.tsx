import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ArrowRight, Scale } from "lucide-react";
import {
  MarketingShell,
  PageHero,
  TerminalCommand,
  TerminalPanel,
  terminal,
} from "@/components/marketing";
import { COMPARISONS, getComparisonBySlug } from "@/lib/comparisons";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);
  if (!comparison) return { title: "Not Found" };

  return {
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    alternates: { canonical: `/vs/${slug}` },
    openGraph: {
      title: comparison.metaTitle,
      description: comparison.metaDescription,
      type: "article",
    },
  };
}

export default async function ComparisonPage({ params }: PageProps) {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);
  if (!comparison) notFound();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: comparison.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const others = COMPARISONS.filter((c) => c.slug !== slug);

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <PageHero
        eyebrow="comparison"
        title={
          <>
            Envpilot <span className="text-ink-faint">vs</span>{" "}
            <span className="text-accent">{comparison.name}</span>
          </>
        }
        description={comparison.intro[0]}
      />

      {/* Intro */}
      <section className="pb-20">
        <div className={terminal.shell}>
          <p className="max-w-3xl font-sans text-[16px] leading-relaxed text-ink-muted">
            {comparison.intro[1]}
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="pb-20">
        <div className={terminal.shell}>
          <TerminalCommand
            cmd={`envpilot compare ${comparison.slug}`}
            comment="the honest version — including where they're ahead."
          />
          <div className="mt-10">
            <TerminalPanel
              title={`envpilot vs ${comparison.name}`}
              meta={`${comparison.rows.length} rows`}
              bodyClassName="p-0"
            >
              {/* Phones get stacked rows — three prose columns cannot be read
                  in a 390px scroller. */}
              <div className="divide-y divide-line sm:hidden">
                {comparison.rows.map((row) => (
                  <div key={row.feature} className="px-5 py-4">
                    <p
                      className={`${terminal.mono} text-[11px] tracking-[0.14em] text-ink-faint uppercase`}
                    >
                      {row.feature}
                    </p>
                    <p className="mt-2 font-sans text-[15px] leading-relaxed text-ink">
                      <span className={`${terminal.mono} mr-2 text-accent`}>
                        envpilot
                      </span>
                      {row.envpilot}
                    </p>
                    <p className="mt-2 font-sans text-[15px] leading-relaxed text-ink-muted">
                      <span className={`${terminal.mono} mr-2 text-ink-faint`}>
                        {comparison.name.toLowerCase()}
                      </span>
                      {row.competitor}
                    </p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table
                  className={`w-full min-w-[640px] text-left ${terminal.mono} text-[13px]`}
                >
                  <thead>
                    <tr className={`border-b ${terminal.line}`}>
                      <th className="px-5 py-3 text-[11px] tracking-[0.14em] text-ink-faint uppercase">
                        feature
                      </th>
                      <th className="px-5 py-3 text-[11px] tracking-[0.14em] text-accent uppercase">
                        envpilot
                      </th>
                      <th className="px-5 py-3 text-[11px] tracking-[0.14em] text-ink-muted uppercase">
                        {comparison.name}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {comparison.rows.map((row) => (
                      <tr key={row.feature}>
                        <td className="px-5 py-4 text-ink-subtle">
                          {row.feature}
                        </td>
                        <td className="px-5 py-4 leading-relaxed text-ink">
                          {row.envpilot}
                        </td>
                        <td className="px-5 py-4 leading-relaxed text-ink-muted">
                          {row.competitor}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TerminalPanel>
          </div>
        </div>
      </section>

      {/* When to choose which */}
      <section className="pb-20">
        <div className={terminal.shell}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`${terminal.panel} h-full p-7`}>
              <h2 className="flex items-center gap-2 font-sans text-[18px] font-semibold tracking-[-0.02em] text-ink">
                <Check className="h-5 w-5 text-accent" />
                Choose Envpilot if…
              </h2>
              <ul className="mt-5 space-y-3">
                {comparison.chooseEnvpilot.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 font-sans text-[15px] leading-relaxed text-ink-muted"
                  >
                    <span aria-hidden className="mt-0.5 font-mono text-accent">
                      ❯
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${terminal.panel} h-full p-7`}>
              <h2 className="flex items-center gap-2 font-sans text-[18px] font-semibold tracking-[-0.02em] text-ink">
                <Scale className="h-5 w-5 text-ink-subtle" />
                Choose {comparison.name} if…
              </h2>
              <ul className="mt-5 space-y-3">
                {comparison.chooseCompetitor.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 font-sans text-[15px] leading-relaxed text-ink-muted"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 font-mono text-ink-faint"
                    >
                      ❯
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20">
        <div className={terminal.shell}>
          <TerminalCommand
            cmd="envpilot --help migration"
            comment="what people ask before they switch."
          />
          <div
            className={`mt-10 divide-y divide-line border-y ${terminal.line}`}
          >
            {comparison.faq.map(({ q, a }) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-[16px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {q}
                  <span
                    aria-hidden
                    className={`${terminal.mono} shrink-0 text-ink-faint transition-transform group-open:rotate-45`}
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl font-sans text-[16px] leading-relaxed text-ink-muted">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + cross-links */}
      <section className="pb-24">
        <div className={terminal.shell}>
          <h2 className="max-w-lg font-sans text-[clamp(2rem,4.5vw,3rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-ink">
            Import your .env files, invite the team, done.
          </h2>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className={terminal.cta}>
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className={terminal.ctaGhost}>
              See pricing
            </Link>
          </div>
          <p className={`mt-10 ${terminal.mono} text-[12px] text-ink-faint`}>
            more comparisons:{" "}
            {others.map((c, i) => (
              <span key={c.slug}>
                <Link
                  href={`/vs/${c.slug}`}
                  className="text-ink-subtle underline-offset-4 transition-colors hover:text-accent hover:underline"
                >
                  {c.title}
                </Link>
                {i < others.length - 1 && " · "}
              </span>
            ))}
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
