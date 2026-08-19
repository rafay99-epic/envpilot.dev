import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { getDocBySlug, getAllDocs, getNavigation } from "@/lib/content";
import { extractHeadings } from "@/lib/headings";
import {
  docsComponents,
  GlowCard,
  GlowDivider,
  jsonLdScript,
  MermaidChart,
  remarkMermaid,
  Reveal,
  SITE_URLS,
} from "@envpilot/ui";
import { DocsSidebar } from "@/components/DocsSidebar";
import { DOC_ICONS } from "@/components/doc-icons";
import { TableOfContents } from "@/components/TableOfContents";
import { DocsShell } from "@/components/shell";
import { DocSkeleton } from "@/components/doc-skeleton";
import { LLMActions } from "@/components/LLMActions";
import { Callout, Steps, Endpoint } from "@/components/mdx";
import Link from "next/link";

// Shared MDX overrides plus the docs-only building blocks.
const mdxComponents = {
  ...docsComponents,
  MermaidChart,
  Callout,
  Steps,
  Endpoint,
};

const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkMermaid],
    rehypePlugins: [
      [
        rehypePrettyCode,
        {
          theme: "github-dark-default",
          keepBackground: true,
          defaultLang: "bash",
          // Only process fenced code blocks (```).
          // Leave inline `code` as plain <code> elements so our
          // MDX component handles their styling.
          bypassInlineCode: true,
        },
      ],
    ],
  },
};

async function DocBody({ source }: { source: string }) {
  "use cache";
  cacheLife("max");

  return (
    <MDXRemote
      source={source}
      components={mdxComponents}
      options={mdxOptions as never}
    />
  );
}

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug.split("/") }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const slug = (await params).slug.join("/");
  const doc = getDocBySlug(slug);
  if (!doc) return { title: "Not Found" };

  return {
    title: `${doc.title} — Envpilot Docs`,
    description: doc.description,
    alternates: { canonical: `${SITE_URLS.docs}/${slug}` },
    openGraph: {
      title: `${doc.title} — Envpilot Documentation`,
      description: doc.description,
      type: "article",
      url: `${SITE_URLS.docs}/${slug}`,
    },
  };
}

export default function DocPage({ params }: PageProps) {
  return (
    <DocsShell>
      <Suspense fallback={<DocSkeleton />}>
        <Doc params={params} />
      </Suspense>
    </DocsShell>
  );
}

async function Doc({ params }: PageProps) {
  const slug = (await params).slug.join("/");
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  // Sections have no index route, so the trail is docs home → this page.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${SITE_URLS.docs}/${slug}#article`,
        headline: doc.title,
        description: doc.description,
        articleSection: doc.section,
        url: `${SITE_URLS.docs}/${slug}`,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URLS.docs}/#website` },
        publisher: {
          "@type": "Organization",
          "@id": `${SITE_URLS.www}/#organization`,
          name: "Envpilot",
          url: SITE_URLS.www,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URLS.docs}/#website`,
        name: "Envpilot Docs",
        url: SITE_URLS.docs,
        publisher: { "@id": `${SITE_URLS.www}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Docs",
            item: SITE_URLS.docs,
          },
          { "@type": "ListItem", position: 2, name: doc.title },
        ],
      },
    ],
  };

  const allDocs = getAllDocs();
  const sections = getNavigation();

  const currentIndex = allDocs.findIndex((d) => d.slug === slug);
  const prev = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const next =
    currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  const headings = extractHeadings(doc.content);
  const Icon = DOC_ICONS[doc.icon] ?? DOC_ICONS["file-text"];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
      />
      <div className="relative">
        {/* Deliberately no ambient backdrop here: docs are a reading
            surface — glow/grid/noise layers behind body text hurt
            legibility. Decorative effects stay on non-reading pages. */}

        {/* ── 3-zone layout: sidebar / article / on-this-page rail ── */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-8 lg:pt-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
            <DocsSidebar sections={sections} activeSlug={slug} />

            <main className="min-w-0 flex-1 lg:max-w-3xl">
              {/* ── Article header ──────────────────────────────── */}
              <Reveal>
                <header>
                  <div className="flex flex-wrap items-center gap-3">
                    <nav
                      aria-label="Breadcrumb"
                      className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-ink-faint"
                    >
                      <Link
                        href="/"
                        className="transition-colors hover:text-accent"
                      >
                        docs
                      </Link>
                      <span aria-hidden>/</span>
                      <span className="text-accent">{doc.section}</span>
                    </nav>
                    {doc.version && (
                      <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle">
                        v{doc.version}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h1 className="font-sans text-3xl font-bold tracking-tight text-ink md:text-4xl">
                        {doc.title}
                      </h1>
                      {doc.description && (
                        <p className="mt-3 font-mono text-sm leading-relaxed text-ink-subtle">
                          {doc.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-5">
                    <LLMActions slug={slug} title={doc.title} />
                  </div>

                  <GlowDivider className="mt-8" />
                </header>
              </Reveal>

              {/* ── MDX content ─────────────────────────────────── */}
              <article className="mt-10">
                <DocBody source={doc.content} />
              </article>

              {/* ── Prev / Next ─────────────────────────────────── */}
              <nav
                aria-label="Docs pagination"
                className="mt-16 grid gap-4 sm:grid-cols-2"
              >
                {prev ? (
                  <Link href={`/${prev.slug}`} className="block h-full">
                    <GlowCard className="h-full">
                      <div className="flex h-full flex-col gap-2 p-5">
                        <span className="font-mono text-[11px] tracking-widest text-ink-subtle">
                          ← {prev.section.toLowerCase()}
                        </span>
                        <span className="font-sans text-base font-semibold text-ink transition-colors group-hover:text-accent">
                          {prev.title}
                        </span>
                      </div>
                    </GlowCard>
                  </Link>
                ) : (
                  <div aria-hidden className="hidden sm:block" />
                )}

                {next ? (
                  <Link href={`/${next.slug}`} className="block h-full">
                    <GlowCard className="h-full">
                      <div className="flex h-full flex-col items-end gap-2 p-5 text-right">
                        <span className="font-mono text-[11px] tracking-widest text-ink-subtle">
                          {next.section.toLowerCase()} →
                        </span>
                        <span className="font-sans text-base font-semibold text-ink transition-colors group-hover:text-accent">
                          {next.title}
                        </span>
                      </div>
                    </GlowCard>
                  </Link>
                ) : (
                  <div aria-hidden className="hidden sm:block" />
                )}
              </nav>
            </main>

            {/* ── On-this-page rail (zone 3) ──────────────────────── */}
            {headings.length > 0 && (
              <aside
                aria-label="On this page"
                className="hidden w-52 shrink-0 xl:block"
              >
                <TableOfContents headings={headings} />
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
