"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { PageHero, TerminalPanel, terminal } from "@/components/marketing";
import {
  Mail,
  CheckCircle,
  AlertTriangle,
  LifeBuoy,
  HelpCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const EMAILS = [
  { label: "General inquiries", address: "hello@envpilot.dev" },
  { label: "Support", address: "support@envpilot.dev" },
  { label: "Privacy", address: "privacy@envpilot.dev" },
];

const CHANNELS = [
  {
    href: "/support",
    title: "Submit a support ticket",
    description: "Hit a bug or need a hand? Open a ticket.",
    icon: <LifeBuoy className="h-4 w-4 text-accent" />,
  },
  {
    href: "/faq",
    title: "Browse the FAQ",
    description: "Plans, billing, limits, and security — answered.",
    icon: <HelpCircle className="h-4 w-4 text-accent" />,
  },
  {
    href: "/wishlist",
    title: "Request a feature",
    description: "Tell us what to build next on the wishlist.",
    icon: <Sparkles className="h-4 w-4 text-accent" />,
  },
];

export function ContactBody() {
  const submitMessage = useMutation(
    api.features.support.contactMessages.submit
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      await submitMessage({ name, email, subject, message });
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHero
        eyebrow="contact"
        title="Say hello."
        description="A question, a partnership idea, or feedback on something that annoyed you — it reaches a person, not a queue."
      />

      <section className="pb-24">
        <div className={terminal.shell}>
          <div className="grid gap-10 lg:grid-cols-5">
            {/* Left — pitch + alternative channels */}
            <div className="space-y-3 lg:col-span-2">
              {CHANNELS.map((channel) => (
                <Link
                  key={channel.href}
                  href={channel.href}
                  className={`group block ${terminal.panel} p-5 transition-shadow hover:ring-line-strong`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft ring-1 ring-accent-line">
                      {channel.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-sans text-[15px] font-semibold text-ink">
                        {channel.title}
                        <ArrowRight className="h-3.5 w-3.5 text-accent transition-transform group-hover:translate-x-0.5" />
                      </p>
                      <p className="mt-1 font-sans text-[14px] leading-relaxed text-ink-muted">
                        {channel.description}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}

              <div className={`${terminal.panel} p-5`}>
                <div className="flex items-center gap-2 font-sans text-[15px] font-semibold text-ink">
                  <Mail className="h-4 w-4 text-accent" />
                  Email us
                </div>
                <div className="mt-4 space-y-3">
                  {EMAILS.map((item) => (
                    <div key={item.address}>
                      <p
                        className={`${terminal.mono} text-[11px] tracking-[0.14em] text-ink-faint uppercase`}
                      >
                        {item.label}
                      </p>
                      <a
                        href={`mailto:${item.address}`}
                        className={`mt-1 block ${terminal.mono} text-[13px] text-accent underline-offset-4 hover:underline`}
                      >
                        {item.address}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — the form */}
            <div className="lg:col-span-3">
              <TerminalPanel
                title={
                  isSubmitted
                    ? "contact — message sent"
                    : "contact — new message"
                }
                bodyClassName="p-6 sm:p-8"
              >
                {isSubmitted ? (
                  <div className="py-10 text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft ring-1 ring-accent-line">
                      <CheckCircle className="h-7 w-7 text-accent" />
                    </span>
                    <h2 className="mt-5 font-sans text-[20px] font-semibold tracking-[-0.02em] text-ink">
                      Message sent
                    </h2>
                    <p className="mx-auto mt-3 max-w-md font-sans text-[15px] leading-relaxed text-ink-muted">
                      Thanks for reaching out — we&apos;ll reply at{" "}
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
                        setSubject("");
                        setMessage("");
                      }}
                      className="mt-7 rounded-md px-5 py-2.5 font-sans text-[14px] text-ink-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
                    >
                      Send another message
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
                          htmlFor="contact-name"
                          className={`mb-1.5 block ${terminal.label}`}
                        >
                          <span className="mr-1.5 text-accent">❯</span> name
                        </label>
                        <input
                          id="contact-name"
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
                          htmlFor="contact-email"
                          className={`mb-1.5 block ${terminal.label}`}
                        >
                          <span className="mr-1.5 text-accent">❯</span> email
                        </label>
                        <input
                          id="contact-email"
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

                    {/* Subject */}
                    <div>
                      <label
                        htmlFor="contact-subject"
                        className={`mb-1.5 block ${terminal.label}`}
                      >
                        <span className="mr-1.5 text-accent">❯</span> subject
                      </label>
                      <input
                        id="contact-subject"
                        name="subject"
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                        maxLength={200}
                        placeholder="What's this about?"
                        className={terminal.input}
                      />
                    </div>

                    {/* Message */}
                    <div>
                      <label
                        htmlFor="contact-message"
                        className={`mb-1.5 block ${terminal.label}`}
                      >
                        <span className="mr-1.5 text-accent">❯</span> message
                      </label>
                      <textarea
                        id="contact-message"
                        name="message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        maxLength={5000}
                        rows={8}
                        placeholder="Tell us what's on your mind…"
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
                      {isSubmitting ? "Sending…" : "Send message"}
                    </button>
                  </form>
                )}
              </TerminalPanel>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
