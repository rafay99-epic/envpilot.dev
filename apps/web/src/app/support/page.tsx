"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  LifeBuoy,
  Bug,
  User,
  CreditCard,
  Terminal,
  Puzzle,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

type Category = "bug" | "account" | "billing" | "cli" | "extension" | "other";
type Priority = "low" | "medium" | "high";

const CATEGORIES: { value: Category; label: string; icon: React.ReactNode }[] =
  [
    {
      value: "bug",
      label: "Bug Report",
      icon: <Bug className="h-4 w-4" />,
    },
    {
      value: "account",
      label: "Account",
      icon: <User className="h-4 w-4" />,
    },
    {
      value: "billing",
      label: "Billing",
      icon: <CreditCard className="h-4 w-4" />,
    },
    {
      value: "cli",
      label: "CLI",
      icon: <Terminal className="h-4 w-4" />,
    },
    {
      value: "extension",
      label: "VS Code Extension",
      icon: <Puzzle className="h-4 w-4" />,
    },
    {
      value: "other",
      label: "Other",
      icon: <HelpCircle className="h-4 w-4" />,
    },
  ];

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "text-zinc-400" },
  { value: "medium", label: "Medium", color: "text-amber-400" },
  { value: "high", label: "High", color: "text-red-400" },
];

export default function SupportPage() {
  const submitTicket = useMutation(api.supportTickets.submit);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<Category>("bug");
  const [priority, setPriority] = useState<Priority>("medium");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await submitTicket({ name, email, category, priority, subject, message });
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit ticket.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-mono text-green-400">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-green-400">$</span>
            <span className="font-bold text-zinc-100">envpilot</span>
            <span className="text-xs text-zinc-600">v1.0</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {[
              { label: "Changelog", href: "/changelog" },
              { label: "Wishlist", href: "/wishlist" },
              { label: "Docs", href: "/docs" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-xs text-zinc-500 transition-colors hover:text-green-400"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-xs text-zinc-500 transition-colors hover:text-green-400"
            >
              sign-in
            </Link>
            <Link
              href="/sign-up"
              className="rounded border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-all hover:bg-green-500/20"
            >
              get-started
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="border-b border-zinc-800/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// support"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              How can we help?
            </h1>
            <p className="mt-3 max-w-xl text-sm text-zinc-500">
              Run into an issue or need help with Envpilot? Submit a support
              ticket and we&apos;ll get back to you as soon as possible.
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-12">
          <div className="mx-auto max-w-5xl px-4">
            <div className="grid gap-12 lg:grid-cols-3">
              {/* Sidebar - Quick help */}
              <div className="lg:col-span-1">
                <div className="sticky top-20 space-y-6">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                      <LifeBuoy className="h-4 w-4 text-green-400" />
                      Quick links
                    </div>
                    <ul className="mt-4 space-y-3">
                      <li>
                        <Link
                          href="/docs"
                          className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-green-400"
                        >
                          <span className="text-green-500">&gt;</span>
                          Documentation
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/changelog"
                          className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-green-400"
                        >
                          <span className="text-green-500">&gt;</span>
                          Changelog
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/wishlist"
                          className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-green-400"
                        >
                          <span className="text-green-500">&gt;</span>
                          Feature requests
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/contact"
                          className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-green-400"
                        >
                          <span className="text-green-500">&gt;</span>
                          Contact us
                        </Link>
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                      response time
                    </p>
                    <p className="mt-2 text-sm text-zinc-400">
                      We typically respond to support tickets within{" "}
                      <span className="text-green-400">24 hours</span> on
                      business days.
                    </p>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                      email us directly
                    </p>
                    <a
                      href="mailto:support@envpilot.dev"
                      className="mt-2 block text-sm text-green-400 hover:underline"
                    >
                      support@envpilot.dev
                    </a>
                  </div>
                </div>
              </div>

              {/* Main form */}
              <div className="lg:col-span-2">
                {isSubmitted ? (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-8 text-center">
                    <CheckCircle className="mx-auto h-10 w-10 text-green-400" />
                    <h2 className="mt-4 text-lg font-semibold text-zinc-100">
                      Ticket submitted
                    </h2>
                    <p className="mt-2 text-sm text-zinc-400">
                      <span className="text-green-400">$</span> echo
                      &quot;We&apos;ve received your support request and will
                      get back to you at{" "}
                      <span className="text-green-400">{email}</span>{" "}
                      shortly.&quot;
                    </p>
                    <button
                      onClick={() => {
                        setIsSubmitted(false);
                        setName("");
                        setEmail("");
                        setCategory("bug");
                        setPriority("medium");
                        setSubject("");
                        setMessage("");
                      }}
                      className="mt-6 rounded border border-zinc-700 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                    >
                      Submit another ticket
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {error}
                      </div>
                    )}

                    {/* Name and Email */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs text-zinc-500">
                          Name
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          maxLength={100}
                          placeholder="Your name"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs text-zinc-500">
                          Email
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          placeholder="you@example.com"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="mb-1.5 block text-xs text-zinc-500">
                        Category
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {CATEGORIES.map((cat) => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setCategory(cat.value)}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
                              category === cat.value
                                ? "border-green-500/30 bg-green-500/10 text-green-400"
                                : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                            }`}
                          >
                            {cat.icon}
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority */}
                    <div>
                      <label className="mb-1.5 block text-xs text-zinc-500">
                        Priority
                      </label>
                      <div className="flex gap-2">
                        {PRIORITIES.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPriority(p.value)}
                            className={`rounded-lg border px-4 py-2 text-xs transition-all ${
                              priority === p.value
                                ? "border-green-500/30 bg-green-500/10 text-green-400"
                                : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                            }`}
                          >
                            <span className={p.color}>&bull;</span> {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="mb-1.5 block text-xs text-zinc-500">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                        maxLength={200}
                        placeholder="Brief description of the issue"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                      />
                    </div>

                    {/* Message */}
                    <div>
                      <label className="mb-1.5 block text-xs text-zinc-500">
                        Message
                      </label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        maxLength={5000}
                        rows={8}
                        placeholder="Please describe the issue in detail. Include steps to reproduce, expected behavior, and any error messages you see."
                        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
                      />
                      <p className="mt-1 text-right text-[10px] text-zinc-700">
                        {message.length}/5000
                      </p>
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded border border-green-500/30 bg-green-500/10 px-6 py-2.5 text-sm text-green-400 transition-all hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-pulse">_</span> Submitting...
                        </span>
                      ) : (
                        "Submit ticket"
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-8">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span className="text-green-500">$</span> envpilot --version{" "}
              <span className="text-zinc-500">1.0.0</span>
            </div>
            <div className="flex gap-4 text-xs text-zinc-600">
              <Link href="/docs" className="hover:text-zinc-400">
                Docs
              </Link>
              <Link href="/changelog" className="hover:text-zinc-400">
                Changelog
              </Link>
              <Link href="/privacy" className="hover:text-zinc-400">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-zinc-400">
                Terms
              </Link>
              <Link href="/faq" className="hover:text-zinc-400">
                FAQ
              </Link>
              <Link href="/support" className="hover:text-zinc-400">
                Support
              </Link>
              <Link href="/contact" className="hover:text-zinc-400">
                Contact
              </Link>
            </div>
            <div className="text-right text-xs text-zinc-700">
              <p>&copy; {new Date().getFullYear()} Envpilot</p>
              <p className="text-[10px] text-zinc-800">
                Built at{" "}
                <a
                  href="https://syntaxlabtechnology.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Syntax Lab Technology
                </a>{" "}
                &middot;{" "}
                <a
                  href="https://rafay99.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-zinc-500"
                >
                  Abdul Rafay
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
