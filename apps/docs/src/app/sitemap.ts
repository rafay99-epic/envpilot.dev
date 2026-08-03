import type { MetadataRoute } from "next";
import { getAllDocs } from "@/lib/content";
import { SITE_URLS } from "@envpilot/ui";

export default function sitemap(): MetadataRoute.Sitemap {
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
