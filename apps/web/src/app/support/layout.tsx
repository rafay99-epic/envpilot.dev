import type { Metadata } from "next";

// The support page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Support | Envpilot",
  description:
    "Submit a support ticket for Envpilot. Bug reports, account issues, billing questions, CLI and VS Code extension help.",
  alternates: { canonical: "/support" },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
