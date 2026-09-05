import type { MetadataRoute } from "next";

// Makes the dashboard installable from a phone's share sheet. No service
// worker on purpose: a secrets manager has nothing worth caching offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Envpilot",
    short_name: "Envpilot",
    description: "Review and approve environment changes",
    start_url: "/dashboard/requests",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#22c55e",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
