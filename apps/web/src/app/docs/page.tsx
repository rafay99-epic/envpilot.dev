import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { DocsContent } from "@/components/docs/DocsContent";

export const metadata: Metadata = {
  title: "Documentation | Envpilot",
  description:
    "Complete documentation for Envpilot. Learn about the CLI tool, VS Code extension, web dashboard, security architecture, and role-based permissions.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header — server-rendered */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-semibold text-white">
              Documentation
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 transition-colors hover:text-white"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Docs content — client island for tab switching */}
      <DocsContent />
    </div>
  );
}
