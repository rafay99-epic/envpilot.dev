import type { MetadataRoute } from "next";
import { SITE_URLS } from "@envpilot/ui";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: `${SITE_URLS.blog}/sitemap.xml`,
  };
}
