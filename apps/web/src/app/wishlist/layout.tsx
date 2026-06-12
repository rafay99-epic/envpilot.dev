import type { Metadata } from "next";

// The wishlist page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Wishlist | Envpilot",
  description:
    "Request features and vote on what Envpilot builds next. Community-driven roadmap for the secure environment variable platform.",
  alternates: { canonical: "/wishlist" },
};

export default function WishlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
