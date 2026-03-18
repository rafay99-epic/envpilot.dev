import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.envpilot.dev";

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
  openGraph: {
    type: "website",
    siteName: "Envpilot",
    title: "Envpilot — Secure Environment Variable Management",
    description:
      "Securely manage, share, and sync environment variables across your team with CLI, VS Code extension, and web dashboard.",
    url: baseUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Envpilot — Secure Environment Variable Management",
    description:
      "Securely manage, share, and sync environment variables across your team.",
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
        <ConvexClientProvider>{children}</ConvexClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
