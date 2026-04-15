import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { getDocBySlug, getAllDocs } from "@/lib/docs/content";
import { docsComponents } from "@/components/docs/mdx-components";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsHeaderButtons } from "@/components/docs/DocsHeaderButtons";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";

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
    openGraph: {
      title: `${doc.title} — Envpilot Documentation`,
      description: doc.description,
      type: "article",
    },
  };
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

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ── Header (matches landing page) ────────────────────────── */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-1.5">
              <span className="font-mono text-green-400">$</span>
              <span className="text-sm font-bold text-zinc-100">envpilot</span>
              <span className="ml-1 text-xs text-zinc-600">docs</span>
            </Link>

            <nav className="hidden items-center gap-5 md:flex">
              {["Getting Started", "CLI", "Extension"].map((label) => {
                const s = label.toLowerCase().replace(/ /g, "-");
                return (
                  <Link
                    key={s}
                    href={`/docs/${s}`}
                    className={`text-xs transition-colors ${
                      slug === s
                        ? "text-green-400"
                        : "text-zinc-500 hover:text-green-400"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <DocsHeaderButtons />
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-6xl gap-0 px-6 pt-24 pb-16 lg:gap-10">
        <DocsSidebar items={allDocs} activeSlug={slug} />

        <main className="min-w-0 flex-1">
          {/* Page subtitle from frontmatter */}
          {doc.description && (
            <p className="mb-8 text-base leading-relaxed text-zinc-500">
              {doc.description}
            </p>
          )}

          {/* MDX content */}
          <article>
            <MDXRemote
              source={doc.content}
              components={docsComponents}
              options={mdxOptions as never}
            />
          </article>

          {/* ── Prev / Next ─────────────────────────────────────── */}
          <nav className="mt-16 flex items-stretch gap-4 border-t border-zinc-800/50 pt-8">
            {prev ? (
              <Link
                href={`/docs/${prev.slug}`}
                className="group flex flex-1 flex-col rounded-lg border border-zinc-800 p-4 transition-all hover:border-green-500/30 hover:bg-green-500/5"
              >
                <span className="flex items-center gap-1 text-xs text-zinc-600">
                  <ChevronLeft className="h-3 w-3" />
                  Previous
                </span>
                <span className="mt-1 text-sm font-medium text-zinc-400 transition-colors group-hover:text-green-400">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}

            {next ? (
              <Link
                href={`/docs/${next.slug}`}
                className="group flex flex-1 flex-col items-end rounded-lg border border-zinc-800 p-4 transition-all hover:border-green-500/30 hover:bg-green-500/5"
              >
                <span className="flex items-center gap-1 text-xs text-zinc-600">
                  Next
                  <ChevronRight className="h-3 w-3" />
                </span>
                <span className="mt-1 text-sm font-medium text-zinc-400 transition-colors group-hover:text-green-400">
                  {next.title}
                </span>
              </Link>
            ) : (
              <div className="flex-1" />
            )}
          </nav>
        </main>
      </div>
    </div>
  );
}
