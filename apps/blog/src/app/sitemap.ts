import type { MetadataRoute } from "next";
import { SITE_URLS } from "@envpilot/ui";
import { getAllPosts } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URLS.blog,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  const postPages: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${SITE_URLS.blog}/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...postPages];
}
