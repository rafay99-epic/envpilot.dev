export const SITE_URLS = {
  www: process.env.NEXT_PUBLIC_APP_URL || "https://www.envpilot.dev",
  blog: process.env.NEXT_PUBLIC_BLOG_URL || "https://blog.envpilot.dev",
  docs: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.envpilot.dev",
  github: "https://github.com/rafay99-epic/envpilot.dev",
} as const;
