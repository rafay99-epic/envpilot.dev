import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE_URLS } from "@envpilot/ui";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Envpilot Docs",
  description:
    "Documentation for Envpilot — secure environment variable management for teams. CLI, VS Code extension, and web dashboard guides.",
  metadataBase: new URL(SITE_URLS.docs),
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  keywords: [
    "envpilot docs",
    "CLI",
    "VS Code extension",
    "API reference",
    "MCP server",
    "secrets management",
    "environment variables",
    "environment variable management",
    "devops",
  ],
  openGraph: {
    siteName: "Envpilot Docs",
    type: "website",
    images: ["/og-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Envpilot Docs",
    description:
      "Documentation for Envpilot — secure environment variable management for teams.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
