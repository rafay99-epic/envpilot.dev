import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { getDocBySlug, getAllDocs } from "@/lib/content";
import {
  docsComponents,
  GlowCard,
  GlowDivider,
  AuroraGlow,
  GridLines,
  Noise,
  Reveal,
  SITE_URLS,
} from "@envpilot/ui";
import { DocsSidebar, DOC_ICONS } from "@/components/DocsSidebar";
import { DocsShell } from "@/components/shell";
import Link from "next/link";

const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm],
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

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
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

/**
 * Extract h2/h3 headings from the raw MDX body for the "on this page"
 * rail. Ids are generated with the same slug rules as mdx-components,
 * and headings containing markdown syntax are skipped (the rendered
 * heading would not receive an id in that case).
 */
function extractHeadings(content: string) {
  const headings: { depth: number; text: string; id: string }[] = [];
  // Strip fenced code blocks so `#` comments inside them never match.
  const stripped = content.replace(/```[\s\S]*?```/g, "");
  for (const match of stripped.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    const text = match[2].trim();
    if (/[`[\]{}<>*_|]/.test(text)) continue;
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    if (!id) continue;
    headings.push({ depth: match[1].length, text, id });
  }
  return headings;
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const allDocs = getAllDocs();

  const currentIndex = allDocs.findIndex((d) => d.slug === slug);
  const prev = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const next =
    currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  const headings = extractHeadings(doc.content);
  const Icon = DOC_ICONS[doc.icon] ?? DOC_ICONS["file-text"];

  return (
    <DocsShell>
      <div className="relative overflow-hidden">
        {/* ── Ambient backdrop (fades out below the article header) ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <AuroraGlow />
          <GridLines />
        </div>
        <Noise />

        {/* ── 3-zone layout: sidebar / article / on-this-page rail ── */}
        <div className="relative z-10 mx-auto max-w-7xl px-4 pt-10 pb-20 sm:px-6 lg:px-8 lg:pt-14">
          <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
            <DocsSidebar items={allDocs} activeSlug={slug} />

            <main className="min-w-0 flex-1 lg:max-w-3xl">
              {/* ── Article header ──────────────────────────────── */}
              <Reveal>
                <header>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 font-mono text-[11px] tracking-widest text-green-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
                      {"// docs"}
                    </span>
                    {doc.version && (
                      <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                        v{doc.version}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10 text-green-400">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h1 className="font-sans text-3xl font-bold tracking-tight text-zinc-100 md:text-4xl">
                        {doc.title}
                      </h1>
                      {doc.description && (
                        <p className="mt-3 font-mono text-sm leading-relaxed text-zinc-500">
                          {doc.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <GlowDivider className="mt-8" />
                </header>
              </Reveal>

              {/* ── MDX content ─────────────────────────────────── */}
              <article className="mt-10">
                <MDXRemote
                  source={doc.content}
                  components={docsComponents}
                  options={mdxOptions as never}
                />
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
                        <span className="font-mono text-[11px] tracking-widest text-zinc-500">
                          ← previous
                        </span>
                        <span className="font-sans text-base font-semibold text-zinc-200 transition-colors group-hover:text-green-400">
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
                        <span className="font-mono text-[11px] tracking-widest text-zinc-500">
                          next →
                        </span>
                        <span className="font-sans text-base font-semibold text-zinc-200 transition-colors group-hover:text-green-400">
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
                <nav className="sticky top-24">
                  <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest text-green-400">
                    <span className="h-1 w-1 rounded-full bg-green-400" />
                    {"// on this page"}
                  </p>
                  <ul className="mt-4 space-y-2 border-l border-zinc-800/60">
                    {headings.map((heading) => (
                      <li key={heading.id}>
                        <a
                          href={`#${heading.id}`}
                          className={`-ml-px block border-l border-transparent text-xs leading-relaxed text-zinc-500 transition-colors hover:border-green-500/60 hover:text-zinc-200 ${
                            heading.depth === 3 ? "pl-6" : "pl-3"
                          }`}
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>
            )}
          </div>
        </div>
      </div>
    </DocsShell>
  );
}
