import type { Metadata } from "next";

// The contact page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Envpilot team. Questions, partnership inquiries, or feedback — we'd love to hear from you.",
  alternates: { canonical: "/contact" },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
