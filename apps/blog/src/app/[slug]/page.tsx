import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { format, parseISO } from "date-fns";
import { getPostBySlug, getAllPosts } from "@/lib/content";
import {
  docsComponents,
  SITE_URLS,
  GlowDivider,
  AuroraGlow,
  GridLines,
  Noise,
  Reveal,
} from "@envpilot/ui";
import { BlogShell } from "@/components/shell";
import { Mermaid } from "@/components/Mermaid";
import Link from "next/link";
import { ArrowLeft, Clock, Layers } from "lucide-react";

// Shared MDX overrides plus blog-only components (Mermaid diagrams).
const mdxComponents = { ...docsComponents, Mermaid };

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
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Not Found" };

  return {
    title: `${post.title} — Envpilot Blog`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `${SITE_URLS.blog}/${slug}` },
    openGraph: {
      title: `${post.title} — Envpilot Blog`,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      tags: post.tags,
      authors: [post.author.name],
      url: `${SITE_URLS.blog}/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} — Envpilot Blog`,
      description: post.description,
      images: ["/og-image.jpg"],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Person",
      name: post.author.name,
    },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URLS.www}/#organization`,
      name: "Envpilot",
    },
    url: `${SITE_URLS.blog}/${slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URLS.blog}/${slug}`,
    },
    keywords: post.keywords.join(", "),
  };

  return (
    <BlogShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }}
      />
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <AuroraGlow />
          <GridLines />
        </div>
        <Noise />

        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-6 lg:pt-14">
          <main className="min-w-0">
            <Reveal>
              <header>
                {/* Back link + blog badge */}
                <div className="mb-6 flex items-center justify-between gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 transition-colors hover:text-green-400"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">back to blog</span>
                    <span className="sm:hidden">blog</span>
                  </Link>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/5 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-green-400">
                    {"// blog"}
                  </span>
                </div>

                {/* Title */}
                <h1 className="font-sans text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl md:text-4xl">
                  {post.title}
                </h1>

                {/* Author + Date + Reading time row */}
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10 text-[10px] font-bold text-green-400 sm:h-8 sm:w-8 sm:text-xs">
                      {post.author.name.charAt(0)}
                    </div>
                    <span className="font-mono text-sm text-zinc-300">
                      {post.author.name}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className="hidden h-1 w-1 rounded-full bg-zinc-700 sm:block"
                  />
                  <time
                    dateTime={post.date}
                    className="font-mono text-xs text-zinc-500 sm:text-sm"
                  >
                    {format(parseISO(post.date), "MMMM d, yyyy")}
                  </time>
                  <span className="flex items-center gap-1 font-mono text-xs text-zinc-600">
                    <Clock className="h-3 w-3" />
                    {post.readingTime}
                  </span>
                </div>

                {/* Series */}
                {post.series && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-1 font-mono text-xs text-green-400">
                    <Layers className="h-3 w-3" />
                    <span>{post.series}</span>
                    {post.seriesPart && (
                      <span className="text-zinc-500">
                        part {post.seriesPart}
                        {post.seriesTotal ? ` of ${post.seriesTotal}` : ""}
                      </span>
                    )}
                  </div>
                )}

                {/* Tags */}
                {post.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/?tag=${encodeURIComponent(tag)}`}
                        className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 font-mono text-[10px] text-zinc-500 transition-colors hover:border-green-500/30 hover:text-green-400 sm:text-[11px]"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                )}

                <GlowDivider className="mt-8" />
              </header>
            </Reveal>

            {/* Article body */}
            <article className="mt-8 sm:mt-10">
              <MDXRemote
                source={post.content}
                components={mdxComponents}
                options={mdxOptions as never}
              />
            </article>

            {/* Bottom back link */}
            <div className="mt-16 border-t border-zinc-800/60 pt-8">
              <Link
                href="/"
                className="inline-flex items-center gap-2 font-mono text-sm text-zinc-500 transition-colors hover:text-green-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all posts
              </Link>
            </div>
          </main>
        </div>
      </div>
    </BlogShell>
  );
}
