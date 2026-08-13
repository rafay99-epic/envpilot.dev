import type { Metadata } from "next";

/**
 * A shared document must never become a search result. The page is already
 * behind an unguessable token, but a crawler that reaches one link would
 * publish it permanently — the meta tag and the route's `X-Robots-Tag` cover
 * both the rendered page and the API that feeds it.
 */
export const metadata: Metadata = {
  // Static and GENERIC on purpose, on both the tab title and the unfurl.
  //
  // Without it these pages inherit the marketing default, so a shared
  // document opens under "Stop Pasting .env Files Into Slack" — but the fix
  // is not to put the document's own title here. Chat clients fetch a pasted
  // URL to build a preview, and a passphrase-protected page would have its
  // title unfurled into the channel before anyone typed the passphrase. The
  // page itself is the only place the title belongs.
  title: "Shared document",
  description: "A document shared with you through Envpilot.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    // Explicit, because Next.js DEEP-merges metadata down the tree and the
    // root layout sets `googleBot: { index: true, follow: true }` — without
    // this override the one crawler that matters keeps its permission.
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  openGraph: {
    title: "Shared document",
    description: "A document shared with you through Envpilot.",
  },
};

export default function DocShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `dark` is explicit: this route sits outside the dashboard shell, which is
  // where the rest of the app gets the class the `dark:` variants key on.
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <span className="font-mono text-sm font-bold text-accent">
            envpilot
          </span>
          <span className="font-mono text-[11px] text-ink-faint">
            shared document
          </span>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-3xl px-6 pb-16">
        <p className="text-center text-xs text-ink-faint">
          Shared securely with Envpilot. This link expires.
        </p>
      </footer>
    </div>
  );
}
