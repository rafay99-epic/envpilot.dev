import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife } from "next/cache";
import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import { format, parseISO } from "date-fns";
import { getPostBySlug, getAllPosts } from "@/lib/content";
import {
  AuroraGlow,
  docsComponents,
  GlowDivider,
  GridLines,
  jsonLdScript,
  MermaidChart,
  remarkMermaid,
  Reveal,
  SITE_URLS,
} from "@envpilot/ui";
import { BlogShell } from "@/components/shell";
import { ArticleSkeleton } from "@/components/article-skeleton";
import Link from "next/link";
import { ArrowLeft, Clock, Layers } from "lucide-react";

// Shared MDX overrides plus the mermaid renderer for ```mermaid fences.
const mdxComponents = { ...docsComponents, MermaidChart };

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
          bypassInlineCode: true,
        },
      ],
    ],
  },
};

async function PostBody({ source }: { source: string }) {
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
    title: post.title,
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

export default function BlogPostPage({ params }: PageProps) {
  return (
    <BlogShell>
      <Suspense fallback={<ArticleSkeleton />}>
        <Article params={params} />
      </Suspense>
    </BlogShell>
  );
}

async function Article({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  // Team-authored posts resolve to the org entity; a named human gets a
  // Person node, linked to their profile only when we actually know it.
  const author =
    post.author.name === "Envpilot Team"
      ? { "@id": `${SITE_URLS.www}/#organization` }
      : {
          "@type": "Person",
          name: post.author.name,
          ...(post.author.name === "Abdul Rafay" && {
            url: "https://x.com/abdul_rafay99",
          }),
        };

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${SITE_URLS.blog}/${slug}#post`,
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        author,
        publisher: {
          "@type": "Organization",
          "@id": `${SITE_URLS.www}/#organization`,
          name: "Envpilot",
          url: SITE_URLS.www,
        },
        url: `${SITE_URLS.blog}/${slug}`,
        image: post.coverImage
          ? `${SITE_URLS.blog}${post.coverImage}`
          : `${SITE_URLS.blog}/og-image.jpg`,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URLS.blog}/#blog` },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `${SITE_URLS.blog}/${slug}`,
        },
        keywords: post.keywords.join(", "),
      },
      {
        "@type": "Blog",
        "@id": `${SITE_URLS.blog}/#blog`,
        name: "Envpilot Blog",
        url: SITE_URLS.blog,
        publisher: { "@id": `${SITE_URLS.www}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Blog",
            item: SITE_URLS.blog,
          },
          { "@type": "ListItem", position: 2, name: post.title },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(blogPostingSchema) }}
      />
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <AuroraGlow />
          <GridLines />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-6 lg:pt-14">
          <main className="min-w-0">
            <Reveal>
              <header>
                {/* Back link + blog badge */}
                <div className="mb-6 flex items-center justify-between gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-subtle transition-colors hover:text-accent"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">back to blog</span>
                    <span className="sm:hidden">blog</span>
                  </Link>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-accent">
                    {"// blog"}
                  </span>
                </div>

                {/* Title */}
                <h1 className="font-sans text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
                  {post.title}
                </h1>

                {/* Author + Date + Reading time row */}
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-[10px] font-bold text-accent sm:h-8 sm:w-8 sm:text-xs">
                      {post.author.name.charAt(0)}
                    </div>
                    <span className="font-mono text-sm text-ink-muted">
                      {post.author.name}
                    </span>
                  </div>
                  <span
                    aria-hidden
                    className="hidden h-1 w-1 rounded-full bg-surface-hover sm:block"
                  />
                  <time
                    dateTime={post.date}
                    className="font-mono text-xs text-ink-subtle sm:text-sm"
                  >
                    {format(parseISO(post.date), "MMMM d, yyyy")}
                  </time>
                  <span className="flex items-center gap-1 font-mono text-xs text-ink-faint">
                    <Clock className="h-3 w-3" />
                    {post.readingTime}
                  </span>
                </div>

                {/* Series */}
                {post.series && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-accent-line bg-accent-soft px-2.5 py-1 font-mono text-xs text-accent">
                    <Layers className="h-3 w-3" />
                    <span>{post.series}</span>
                    {post.seriesPart && (
                      <span className="text-ink-subtle">
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
                        className="rounded-full border border-line bg-surface/40 px-2.5 py-0.5 font-mono text-[10px] text-ink-subtle transition-colors hover:border-accent-line hover:text-accent sm:text-[11px]"
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
              <PostBody source={post.content} />
            </article>

            {/* Bottom back link */}
            <div className="mt-16 border-t border-line pt-8">
              <Link
                href="/"
                className="inline-flex items-center gap-2 font-mono text-sm text-ink-subtle transition-colors hover:text-accent"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all posts
              </Link>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
