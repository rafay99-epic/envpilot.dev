"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  MarketingShell,
  PageHero,
  SITE_URLS,
  TerminalPanel,
  terminal,
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
  { value: "low", label: "Low", dot: "bg-surface-hover" },
  { value: "medium", label: "Medium", dot: "bg-warning" },
  { value: "high", label: "High", dot: "bg-danger" },
];

// Segmented control: selected and resting branches must differ on ring, not just fill.
const CHOICE_CLASSES = (selected: boolean) =>
  `flex items-center gap-2 rounded-md px-3 py-2.5 font-sans text-[14px] ring-1 transition-colors ${
    selected
      ? "bg-accent-soft text-accent ring-accent-line"
      : "text-ink-muted ring-line hover:text-ink hover:ring-line-strong"
  }`;

const QUICK_LINKS = [
  { href: SITE_URLS.docs, label: "Documentation" },
  { href: "/changelog", label: "Changelog" },
  { href: "/wishlist", label: "Feature requests" },
  { href: "/contact", label: "Contact us" },
];

export default function SupportPage() {
  const submitTicket = useMutation(api.features.support.supportTickets.submit);

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
        description="Run into an issue or need help with Envpilot? Open a ticket and we'll get back to you — usually within a day."
      />

      <section className="pb-24">
        <div className={terminal.shell}>
          <div className="grid gap-10 lg:grid-cols-3">
            {/* Sidebar - Quick help */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-3">
                <div className={`${terminal.panel} p-5`}>
                  <div className="flex items-center gap-2 font-sans text-[15px] font-semibold text-ink">
                    <LifeBuoy className="h-4 w-4 text-accent" />
                    Quick links
                  </div>
                  <ul className="mt-4 space-y-2.5">
                    {QUICK_LINKS.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className={`flex items-center gap-2 ${terminal.mono} text-[13px] text-ink-subtle transition-colors hover:text-accent`}
                        >
                          <span className="text-accent">❯</span>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={`${terminal.panel} p-5`}>
                  <p
                    className={`${terminal.mono} text-[11px] tracking-[0.14em] text-ink-faint uppercase`}
                  >
                    response time
                  </p>
                  <p className="mt-2 font-sans text-[15px] leading-relaxed text-ink-muted">
                    We typically respond to support tickets within{" "}
                    <span className="text-accent">24 hours</span> on business
                    days.
                  </p>
                </div>

                <div className={`${terminal.panel} p-5`}>
                  <p
                    className={`${terminal.mono} text-[11px] tracking-[0.14em] text-ink-faint uppercase`}
                  >
                    email us directly
                  </p>
                  <a
                    href="mailto:support@envpilot.dev"
                    className={`mt-2 block ${terminal.mono} text-[13px] text-accent underline-offset-4 hover:underline`}
                  >
                    support@envpilot.dev
                  </a>
                </div>
              </div>
            </div>

            {/* Main form */}
            <div className="lg:col-span-2">
              <TerminalPanel
                title={
                  isSubmitted
                    ? "support — ticket submitted"
                    : "support — new ticket"
                }
                bodyClassName="p-6 sm:p-8"
              >
                {isSubmitted ? (
                  <div className="py-10 text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft ring-1 ring-accent-line">
                      <CheckCircle className="h-7 w-7 text-accent" />
                    </span>
                    <h2 className="mt-5 font-sans text-[20px] font-semibold tracking-[-0.02em] text-ink">
                      Ticket submitted
                    </h2>
                    <p className="mx-auto mt-3 max-w-md font-sans text-[15px] leading-relaxed text-ink-muted">
                      We&apos;ve received your request and will reply at{" "}
                      <span className={`${terminal.mono} text-accent`}>
                        {email}
                      </span>
                      .
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
                      className="mt-7 rounded-md px-5 py-2.5 font-sans text-[14px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
                    >
                      Submit another ticket
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                      <div className="flex items-center gap-2 rounded-panel border border-danger-line bg-danger-soft px-4 py-3 font-sans text-[14px] text-danger">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {error}
                      </div>
                    )}

                    {/* Name and Email */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="support-name"
                          className={`mb-1.5 block ${terminal.label}`}
                        >
                          <span className="mr-1.5 text-accent">❯</span> name
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
                          className={terminal.input}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="support-email"
                          className={`mb-1.5 block ${terminal.label}`}
                        >
                          <span className="mr-1.5 text-accent">❯</span> email
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
                          className={terminal.input}
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className={`mb-1.5 block ${terminal.label}`}>
                        <span className="mr-1.5 text-accent">❯</span> category
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {CATEGORIES.map((cat) => (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => setCategory(cat.value)}
                            aria-pressed={category === cat.value}
                            className={CHOICE_CLASSES(category === cat.value)}
                          >
                            {cat.icon}
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Priority */}
                    <div>
                      <label className={`mb-1.5 block ${terminal.label}`}>
                        <span className="mr-1.5 text-accent">❯</span> priority
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {PRIORITIES.map((p) => (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setPriority(p.value)}
                            aria-pressed={priority === p.value}
                            className={`${CHOICE_CLASSES(priority === p.value)} justify-center`}
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
                        className={`mb-1.5 block ${terminal.label}`}
                      >
                        <span className="mr-1.5 text-accent">❯</span> subject
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
                        className={terminal.input}
                      />
                    </div>

                    {/* Message */}
                    <div>
                      <label
                        htmlFor="support-message"
                        className={`mb-1.5 block ${terminal.label}`}
                      >
                        <span className="mr-1.5 text-accent">❯</span> message
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
                        className={`${terminal.input} resize-y`}
                      />
                      <p
                        className={`mt-1 text-right ${terminal.mono} text-[11px] text-ink-faint`}
                      >
                        {message.length}/5000
                      </p>
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`${terminal.cta} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {isSubmitting ? "Submitting…" : "Submit ticket"}
                    </button>
                  </form>
                )}
              </TerminalPanel>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
