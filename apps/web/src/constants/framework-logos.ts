/**
 * Framework logo constants and helpers.
 * Maps ProjectType to SVGL CDN URLs and provides utilities
 * for the "framework:<type>" icon convention.
 */

import type { ProjectType } from "./templates";

/**
 * Maps project types to SVGL CDN URLs for real product logos.
 * Empty string means no logo available (falls back to Lucide icon).
 * @see https://svgl.app
 */
export const FRAMEWORK_LOGOS: Record<ProjectType, string> = {
  nextjs: "https://svgl.app/library/nextjs_icon_dark.svg",
  express: "https://svgl.app/library/expressjs_dark.svg",
  "react-native": "https://svgl.app/library/react_dark.svg",
  react: "https://svgl.app/library/react_dark.svg",
  nodejs: "https://svgl.app/library/nodejs.svg",
  django: "https://svgl.app/library/django.svg",
  flask: "https://svgl.app/library/flask_dark.svg",
  rails: "", // uses inline SVG component
  laravel: "https://svgl.app/library/laravel.svg",
  fastapi: "https://svgl.app/library/fastapi.svg",
  nuxtjs: "https://svgl.app/library/nuxt.svg",
  sveltekit: "https://svgl.app/library/svelte.svg",
  remix: "https://svgl.app/library/remix_dark.svg",
  astro: "", // uses inline SVG component
  nestjs: "https://svgl.app/library/nestjs.svg",
  go: "https://svgl.app/library/golang.svg",
  rust: "https://svgl.app/library/rust_dark.svg",
  spring: "https://svgl.app/library/spring.svg",
  supabase: "https://svgl.app/library/supabase.svg",
  convex: "", // uses inline SVG component
  firebase: "https://svgl.app/library/firebase.svg",
  appwrite: "https://svgl.app/library/appwrite.svg",
  postgresql: "https://svgl.app/library/postgresql.svg",
  redis: "https://svgl.app/library/redis.svg",
  mongodb: "https://svgl.app/library/mongodb.svg",
  docker: "https://svgl.app/library/docker.svg",
  flutter: "https://svgl.app/library/flutter.svg",
  t3: "", // uses inline SVG component
  turborepo: "https://svgl.app/library/turborepo.svg",
  "aws-lambda": "https://svgl.app/library/aws.svg",
  vercel: "https://svgl.app/library/vercel_dark.svg",
  posthog: "", // uses inline SVG component
  custom: "",
};

/** Types that use inline SVG components instead of CDN URLs. */
const INLINE_SVG_TYPES: ProjectType[] = [
  "rails",
  "convex",
  "astro",
  "posthog",
  "t3",
];

/**
 * All project types that have a valid framework logo (non-empty URL or inline SVG).
 * Excludes "custom" and types with no logo. Used for the framework logo picker grid.
 */
export const FRAMEWORK_ICON_TYPES: ProjectType[] = (
  Object.keys(FRAMEWORK_LOGOS) as ProjectType[]
).filter(
  (type) =>
    type !== "custom" &&
    (FRAMEWORK_LOGOS[type] !== "" || INLINE_SVG_TYPES.includes(type))
);

/** Returns true if the icon string uses the "framework:" prefix convention. */
export function isFrameworkIcon(icon: string): boolean {
  return icon.startsWith("framework:");
}

/** Extracts the ProjectType from a "framework:<type>" string, or null if invalid. */
export function parseFrameworkType(icon: string): ProjectType | null {
  if (!isFrameworkIcon(icon)) return null;
  const type = icon.slice("framework:".length);
  if (type in FRAMEWORK_LOGOS) return type as ProjectType;
  return null;
}

/** Returns the "framework:<projectType>" string for storing in the DB. */
export function toFrameworkIcon(projectType: ProjectType): string {
  return `framework:${projectType}`;
}
