import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { getAllDocs } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

// `lastModified` is a wall-clock read, which would make the whole sitemap
// render per request. Docs only change at deploy, so cache it daily.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("days");

  const now = new Date();

  const docsPages: MetadataRoute.Sitemap = getAllDocs().map((doc) => ({
    url: `${SITE_URLS.docs}/${doc.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: doc.slug === "start/quickstart" ? 1 : 0.8,
  }));

  return [
    {
      url: SITE_URLS.docs,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...docsPages,
  ];
}
