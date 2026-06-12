"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  MarketingShell,
  PageHero,
  GlowCard,
  TerminalFrame,
  GlowDivider,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/marketing";
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

const PRIORITIES: { value: Priority; label: string; dot: string }[] = [
  { value: "low", label: "Low", dot: "bg-zinc-400" },
  { value: "medium", label: "Medium", dot: "bg-amber-400" },
  { value: "high", label: "High", dot: "bg-red-400" },
];

const INPUT_CLASSES =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 font-mono text-sm text-zinc-200 placeholder-zinc-600 transition-colors focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20";

const QUICK_LINKS = [
  { href: "/docs", label: "Documentation" },
  { href: "/changelog", label: "Changelog" },
  { href: "/wishlist", label: "Feature requests" },
  { href: "/contact", label: "Contact us" },
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
    <MarketingShell>
      <PageHero
        eyebrow="support"
        title="We've got your back."
        description="Run into an issue or need help with Envpilot? Submit a support ticket and we'll get back to you as soon as possible."
      />

      <GlowDivider />

      <section className="relative py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-3">
            {/* Sidebar - Quick help */}
            <div className="lg:col-span-1">
              <Stagger className="sticky top-24 space-y-5">
                <StaggerItem>
                  <GlowCard className="p-5">
                    <div className="flex items-center gap-2 font-sans text-sm font-semibold text-zinc-100">
                      <LifeBuoy className="h-4 w-4 text-green-400" />
                      Quick links
                    </div>
                    <ul className="mt-4 space-y-3">
                      {QUICK_LINKS.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            className="flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-green-400"
                          >
                            <span className="text-green-500">❯</span>
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlowCard>
                </StaggerItem>

                <StaggerItem>
                  <GlowCard className="p-5">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                      response time
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                      We typically respond to support tickets within{" "}
                      <span className="text-green-400">24 hours</span> on
                      business days.
                    </p>
                  </GlowCard>
                </StaggerItem>

                <StaggerItem>
                  <GlowCard className="p-5">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                      email us directly
                    </p>
                    <a
                      href="mailto:support@envpilot.dev"
                      className="mt-2 block text-sm text-green-400 underline-offset-4 hover:underline"
                    >
                      support@envpilot.dev
                    </a>
                  </GlowCard>
                </StaggerItem>
              </Stagger>
            </div>

            {/* Main form */}
            <div className="lg:col-span-2">
              <Reveal>
                {isSubmitted ? (
                  <TerminalFrame title="support — ticket submitted" glow>
                    <div className="px-2 py-10 text-center">
                      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)]">
                        <CheckCircle className="h-7 w-7 text-green-400" />
                      </span>
                      <h2 className="mt-5 font-sans text-xl font-bold tracking-tight text-zinc-100">
                        Ticket submitted
                      </h2>
                      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
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
                        className="mt-7 rounded-lg border border-zinc-800 px-5 py-2.5 text-xs text-zinc-400 transition-colors hover:border-green-500/30 hover:text-zinc-200"
                      >
                        Submit another ticket
                      </button>
                    </div>
                  </TerminalFrame>
                ) : (
                  <TerminalFrame title="support — new-ticket.sh" glow>
                    <form onSubmit={handleSubmit} className="space-y-6 py-1">
                      {error && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-400">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          {error}
                        </div>
                      )}

                      {/* Name and Email */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="support-name"
                            className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                          >
                            <span className="text-green-500">❯</span> Name
                          </label>
                          <input
                            id="support-name"
                            name="name"
                            type="text"
                            autoComplete="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            maxLength={100}
                            placeholder="Your name"
                            className={INPUT_CLASSES}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="support-email"
                            className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                          >
                            <span className="text-green-500">❯</span> Email
                          </label>
                          <input
                            id="support-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            spellCheck={false}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="you@example.com"
                            className={INPUT_CLASSES}
                          />
                        </div>
                      </div>

                      {/* Category */}
                      <div>
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="text-green-500">❯</span> Category
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {CATEGORIES.map((cat) => (
                            <button
                              key={cat.value}
                              type="button"
                              onClick={() => setCategory(cat.value)}
                              aria-pressed={category === cat.value}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition-all ${
                                category === cat.value
                                  ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_24px_-8px_rgba(34,197,94,0.45)]"
                                  : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-green-500/30 hover:text-zinc-300"
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
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
                          <span className="text-green-500">❯</span> Priority
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {PRIORITIES.map((p) => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => setPriority(p.value)}
                              aria-pressed={priority === p.value}
                              className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs transition-all ${
                                priority === p.value
                                  ? "border-green-500/40 bg-green-500/10 text-green-400 shadow-[0_0_24px_-8px_rgba(34,197,94,0.45)]"
                                  : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-green-500/30 hover:text-zinc-300"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${p.dot}`}
                              />
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Subject */}
                      <div>
                        <label
                          htmlFor="support-subject"
                          className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                        >
                          <span className="text-green-500">❯</span> Subject
                        </label>
                        <input
                          id="support-subject"
                          name="subject"
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          required
                          maxLength={200}
                          placeholder="Brief description of the issue"
                          className={INPUT_CLASSES}
                        />
                      </div>

                      {/* Message */}
                      <div>
                        <label
                          htmlFor="support-message"
                          className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                        >
                          <span className="text-green-500">❯</span> Message
                        </label>
                        <textarea
                          id="support-message"
                          name="message"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          required
                          maxLength={5000}
                          rows={8}
                          placeholder="Please describe the issue in detail. Include steps to reproduce, expected behavior, and any error messages you see."
                          className={`${INPUT_CLASSES} resize-y`}
                        />
                        <p className="mt-1 text-right text-[10px] text-zinc-700">
                          {message.length}/5000
                        </p>
                      </div>

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-lg bg-green-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)] transition-shadow hover:shadow-[0_0_60px_-8px_rgba(34,197,94,0.8)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-pulse">_</span> Submitting…
                          </span>
                        ) : (
                          "Submit ticket"
                        )}
                      </button>
                    </form>
                  </TerminalFrame>
                )}
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
