import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.envpilot.dev";

const ogImagePng = `${baseUrl}/og-image.png`;
const ogImageJpg = `${baseUrl}/og-image.jpg`;

export const metadata: Metadata = {
  title: {
    default: "Envpilot — Secure Environment Variable Management",
    template: "%s | Envpilot",
  },
  description:
    "Securely manage, share, and sync environment variables across your team. CLI, VS Code extension, and web dashboard with role-based access control.",
  metadataBase: new URL(baseUrl),
  alternates: {
    canonical: "/",
  },
  // Facebook, Instagram, WhatsApp, Telegram, LinkedIn, Discord, Slack, iMessage, Pinterest
  openGraph: {
    type: "website",
    siteName: "Envpilot",
    title: "Envpilot — Secure Environment Variable Management",
    description:
      "Securely manage, share, and sync environment variables across your team with CLI, VS Code extension, and web dashboard.",
    url: baseUrl,
    locale: "en_US",
    images: [
      {
        url: ogImagePng,
        secureUrl: ogImagePng,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Envpilot — Secure Environment Variable Management",
      },
    ],
  },
  // Twitter / X — uses JPEG for faster crawler fetching (123KB vs 852KB PNG)
  twitter: {
    card: "summary_large_image",
    title: "Envpilot — Secure Environment Variable Management",
    description:
      "Securely manage, share, and sync environment variables across your team.",
    images: [
      {
        url: ogImageJpg,
        width: 1200,
        height: 630,
        alt: "Envpilot — Secure Environment Variable Management",
      },
    ],
    site: "@envpilot",
    creator: "@envpilot",
  },
  // Apple iMessage & Safari
  appleWebApp: {
    capable: true,
    title: "Envpilot",
    statusBarStyle: "black-translucent",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // Discord & Slack embed accent color, Pinterest rich pins
  other: {
    "theme-color": "#3B82F6",
    "msapplication-TileColor": "#0a0a0a",
    "pinterest-rich-pin": "true",
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
        <Script id="config-shim" strategy="beforeInteractive">
          {`globalThis.CONFIG = globalThis.CONFIG || {};`}
        </Script>
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <Analytics />
        {process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
          <Script
            defer
            src="https://cloud.umami.is/script.js"
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
