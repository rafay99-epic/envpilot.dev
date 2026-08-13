import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ArrowRight, Scale } from "lucide-react";
import {
  MarketingShell,
  PageHero,
  SectionHeading,
  GlowCard,
  GlowDivider,
  Reveal,
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

      <GlowDivider />

      {/* Intro */}
      <section className="relative py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <p className="font-mono text-sm leading-relaxed text-ink-muted">
              {comparison.intro[1]}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Comparison table */}
      <section className="relative pb-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="side by side"
            title={
              <>
                Feature <span className="text-accent">comparison</span>
              </>
            }
            description="The honest version — including where they're ahead."
          />
          <Reveal className="mt-10">
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-surface/60">
                    <th className="px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-ink-subtle">
                      Feature
                    </th>
                    <th className="px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
                      Envpilot
                    </th>
                    <th className="px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-ink-muted">
                      {comparison.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-line last:border-0 ${
                        i % 2 === 1 ? "bg-surface/20" : ""
                      }`}
                    >
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-ink-muted">
                        {row.feature}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs leading-relaxed text-ink-muted">
                        {row.envpilot}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs leading-relaxed text-ink-subtle">
                        {row.competitor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <GlowDivider />

      {/* When to choose which */}
      <section className="relative py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Reveal>
              <GlowCard className="h-full p-7">
                <h2 className="flex items-center gap-2 font-sans text-lg font-bold tracking-tight text-ink">
                  <Check className="h-5 w-5 text-accent" />
                  Choose Envpilot if…
                </h2>
                <ul className="mt-5 space-y-3">
                  {comparison.chooseEnvpilot.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 font-mono text-xs leading-relaxed text-ink-muted"
                    >
                      <span aria-hidden className="mt-0.5 text-accent">
                        ❯
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </GlowCard>
            </Reveal>
            <Reveal delay={0.1}>
              <GlowCard className="h-full p-7">
                <h2 className="flex items-center gap-2 font-sans text-lg font-bold tracking-tight text-ink">
                  <Scale className="h-5 w-5 text-ink-subtle" />
                  Choose {comparison.name} if…
                </h2>
                <ul className="mt-5 space-y-3">
                  {comparison.chooseCompetitor.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 font-mono text-xs leading-relaxed text-ink-subtle"
                    >
                      <span aria-hidden className="mt-0.5 text-ink-faint">
                        ❯
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </GlowCard>
            </Reveal>
          </div>
        </div>
      </section>

      <GlowDivider />

      {/* FAQ */}
      <section className="relative py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHeading
            eyebrow="faq"
            title={
              <>
                Common <span className="text-accent">questions</span>
              </>
            }
          />
          <div className="mt-10 space-y-4">
            {comparison.faq.map(({ q, a }) => (
              <Reveal key={q}>
                <div className="rounded-xl border border-line bg-surface/40 p-6">
                  <h3 className="flex items-start gap-2.5 font-sans text-sm font-bold tracking-tight text-ink">
                    <span aria-hidden className="font-mono text-accent">
                      ❯
                    </span>
                    {q}
                  </h3>
                  <p className="mt-2.5 pl-6 font-mono text-xs leading-relaxed text-ink-subtle">
                    {a}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <GlowDivider />

      {/* CTA + cross-links */}
      <section className="relative py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Reveal>
            <h2 className="font-sans text-2xl font-bold tracking-tight text-ink [text-wrap:balance] sm:text-3xl">
              Try Envpilot <span className="text-accent">free</span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl font-mono text-sm leading-relaxed text-ink-subtle">
              Import your .env files and invite the team in minutes. No credit
              card required.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-mono text-xs font-semibold text-ink-inverse shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)] transition-shadow hover:shadow-[0_0_55px_-8px_rgba(34,197,94,0.8)]"
              >
                Get started free
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-line px-6 py-3 font-mono text-xs text-ink-muted transition-colors hover:border-accent-line hover:text-accent"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-10 font-mono text-xs text-ink-faint">
              More comparisons:{" "}
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
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
