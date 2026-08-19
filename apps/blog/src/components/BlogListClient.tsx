"use client";

import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Search, Tag, Calendar, ArrowRight, Clock } from "lucide-react";
import { GlowCard, Stagger, StaggerItem } from "@envpilot/ui";
import type { BlogPostMeta } from "@/lib/schema";

interface Props {
  posts: BlogPostMeta[];
  allTags: string[];
}

/**
 * Reading `?tag=` is the only thing here that needs the request URL, and it
 * would otherwise keep the entire post list out of the prerendered page. The
 * boundary's fallback is the list itself, unfiltered — so every post ships in
 * the static HTML (crawlable, painted on first frame) and the tag filter
 * applies once the URL is known.
 */
export function BlogListClient({ posts, allTags }: Props) {
  return (
    <Suspense
      fallback={<BlogList posts={posts} allTags={allTags} tag={null} />}
    >
      <BlogListForUrlTag posts={posts} allTags={allTags} />
    </Suspense>
  );
}

function BlogListForUrlTag({ posts, allTags }: Props) {
  const tag = useSearchParams().get("tag");
  return <BlogList posts={posts} allTags={allTags} tag={tag} />;
}

function BlogList({
  posts,
  allTags,
  tag: tagFromUrl,
}: Props & { tag: string | null }) {
  const router = useRouter();

  const [search, setSearch] = useState("");

  const selectedTag: string | null =
    tagFromUrl && allTags.includes(tagFromUrl) ? tagFromUrl : null;

  // Tag counts (for displaying alongside filter chips)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [posts]);

  // Filtered posts
  const filtered = useMemo(() => {
    let result = posts;

    if (selectedTag) {
      result = result.filter((p) => p.tags.includes(selectedTag));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [posts, search, selectedTag]);

  // Featured post = most recent in the filtered set
  const featured = filtered.length > 0 ? filtered[0] : null;
  const rest = filtered.length > 1 ? filtered.slice(1) : [];

  const handleTagClick = (tag: string | null) => {
    if (tag === null || selectedTag === tag) {
      router.push("/", { scroll: false });
    } else {
      router.push(`/?tag=${encodeURIComponent(tag)}`, { scroll: false });
    }
  };

  return (
    <div>
      {/* ── Search bar ──────────────────────────────────────────── */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          aria-label="Search posts"
          placeholder="Search posts by title, content, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface/60 py-3.5 pl-11 pr-4 font-mono text-sm text-ink placeholder-ink-faint transition-[border-color,background-color,box-shadow] focus:border-accent-line focus:outline-none focus:ring-2 focus:ring-accent-line focus:bg-surface-hover/80"
        />
      </div>

      {/* ── Tag filter chips with counts ─────────────────────────── */}
      <div className="mb-10 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleTagClick(null)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-[color,background-color,border-color,box-shadow] ${
            !selectedTag
              ? "border-accent-line bg-accent-soft text-accent shadow-[0_0_12px_rgba(34,197,94,0.08)]"
              : "border-line text-ink-subtle hover:border-line hover:text-ink-muted"
          }`}
        >
          all
          <span className="text-[10px] text-ink-faint">({posts.length})</span>
        </button>
        {allTags.slice(0, 12).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => handleTagClick(tag)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-[color,background-color,border-color,box-shadow] ${
              selectedTag === tag
                ? "border-accent-line bg-accent-soft text-accent shadow-[0_0_12px_rgba(34,197,94,0.08)]"
                : "border-line text-ink-subtle hover:border-line hover:text-ink-muted"
            }`}
          >
            {tag}
            <span className="text-[10px] text-ink-faint">
              ({tagCounts.get(tag) ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* ── Results count ────────────────────────────────────────── */}
      <p className="mb-8 font-mono text-xs text-ink-faint">
        {filtered.length === 0
          ? "// no posts match your filter — try different keywords"
          : `// ${filtered.length} ${filtered.length === 1 ? "post" : "posts"} ${selectedTag ? `tagged #${selectedTag}` : ""}`}
      </p>

      {/* ── Featured post (hero card) ────────────────────────────── */}
      {featured && (
        <Link href={`/${featured.slug}`} className="group mb-8 block">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-line via-line to-line p-6 transition-[border-color,box-shadow] duration-300 hover:border-accent-line hover:shadow-[0_0_32px_rgba(34,197,94,0.06)] sm:p-8">
            {/* Subtle green radial glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 opacity-20"
              style={{
                background:
                  "radial-gradient(circle, rgba(34,197,94,0.15), transparent 65%)",
              }}
            />

            <div className="relative">
              {/* Eyebrow */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-accent">
                  featured
                </span>
                <span className="font-mono text-[11px] text-ink-faint">
                  {format(parseISO(featured.date), "MMMM d, yyyy")}
                </span>
                <span className="font-mono text-[11px] text-ink-faint">
                  {featured.readingTime}
                </span>
              </div>

              {/* Title with gradient text */}
              <h2 className="font-sans text-2xl font-bold tracking-tight text-ink transition-colors group-hover:text-accent sm:text-3xl">
                {featured.title}
              </h2>

              {/* Description */}
              <p className="mt-3 line-clamp-2 max-w-2xl font-mono text-sm leading-relaxed text-ink-subtle">
                {featured.description}
              </p>

              {/* Author + tags */}
              <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-xs font-bold text-accent">
                    {featured.author.name.charAt(0)}
                  </div>
                  <span className="font-mono text-sm text-ink-muted">
                    {featured.author.name}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {featured.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-line bg-surface/60 px-2.5 py-0.5 font-mono text-[10px] text-ink-subtle"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <span className="ml-auto hidden items-center gap-1 font-mono text-xs text-accent opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                  Read post
                  <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── Rest of posts (card grid) ────────────────────────────── */}
      {rest.length > 0 && (
        <>
          {/* Separator line when featured is shown */}
          {featured && (
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-accent-line via-line to-transparent" />
              <span className="font-mono text-[11px] text-ink-faint">
                more articles
              </span>
            </div>
          )}

          <Stagger className="grid gap-5 sm:grid-cols-2">
            {rest.map((post) => (
              <StaggerItem key={post.slug}>
                <Link href={`/${post.slug}`} className="block h-full">
                  <GlowCard className="flex h-full flex-col p-5">
                    {/* Tags */}
                    {post.tags.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {post.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-line bg-surface/60 px-2 py-0.5 font-mono text-[10px] text-ink-subtle"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Title */}
                    <h3 className="font-sans text-base font-bold tracking-tight text-ink transition-colors group-hover:text-accent sm:text-lg">
                      {post.title}
                    </h3>

                    {/* Description */}
                    <p className="mt-2 line-clamp-2 flex-1 font-mono text-xs leading-relaxed text-ink-subtle">
                      {post.description}
                    </p>

                    {/* Meta */}
                    <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 font-mono text-[11px] text-ink-faint">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(post.date), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readingTime}
                      </span>
                    </div>
                  </GlowCard>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </>
      )}

      {/* ── Empty state ──────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <Tag className="mb-4 h-8 w-8 text-ink-faint" />
          <p className="font-mono text-sm text-ink-subtle">
            No posts match your current filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              router.push("/", { scroll: false });
            }}
            className="mt-4 rounded-full border border-line px-4 py-1.5 font-mono text-xs text-ink-muted transition-colors hover:border-accent-line hover:text-accent"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
