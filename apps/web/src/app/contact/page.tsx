"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  MarketingShell,
  PageHero,
  GlowCard,
  GlowDivider,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/marketing";
import {
  Mail,
  CheckCircle,
  AlertTriangle,
  LifeBuoy,
  HelpCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const INPUT_CLASSES =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 font-mono text-sm text-zinc-200 placeholder-zinc-600 transition-colors focus:border-green-500/40 focus:outline-none focus:ring-2 focus:ring-green-500/20";

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
    icon: <LifeBuoy className="h-4 w-4 text-green-400" />,
  },
  {
    href: "/faq",
    title: "Browse the FAQ",
    description: "Plans, billing, limits, and security — answered.",
    icon: <HelpCircle className="h-4 w-4 text-green-400" />,
  },
  {
    href: "/wishlist",
    title: "Request a feature",
    description: "Tell us what to build next on the wishlist.",
    icon: <Sparkles className="h-4 w-4 text-green-400" />,
  },
];

export default function ContactPage() {
  const submitMessage = useMutation(api.contactMessages.submit);

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
    <MarketingShell>
      <PageHero
        eyebrow="contact"
        title="Say hello."
        description="Have a question, partnership inquiry, or just want to say hello? We'd love to hear from you."
      />

      <GlowDivider />

      <section className="relative py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-5">
            {/* Left — pitch + alternative channels */}
            <div className="lg:col-span-2">
              <Stagger className="space-y-5">
                <StaggerItem>
                  <h2 className="font-sans text-2xl font-bold tracking-tight text-zinc-100">
                    Real humans, fast replies.
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                    Whether it&apos;s feedback, a partnership idea, or a
                    question about Envpilot — drop us a line and we&apos;ll
                    route it to the right person.
                  </p>
                </StaggerItem>

                {CHANNELS.map((channel) => (
                  <StaggerItem key={channel.href}>
                    <Link href={channel.href} className="block">
                      <GlowCard className="p-5">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-green-500/20 bg-green-500/5">
                            {channel.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-sans text-sm font-semibold text-zinc-100">
                              {channel.title}
                              <ArrowRight className="h-3.5 w-3.5 text-green-500 transition-transform group-hover:translate-x-0.5" />
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                              {channel.description}
                            </p>
                          </div>
                        </div>
                      </GlowCard>
                    </Link>
                  </StaggerItem>
                ))}

                <StaggerItem>
                  <GlowCard className="p-5">
                    <div className="flex items-center gap-2 font-sans text-sm font-semibold text-zinc-100">
                      <Mail className="h-4 w-4 text-green-400" />
                      Email us
                    </div>
                    <div className="mt-4 space-y-3">
                      {EMAILS.map((item) => (
                        <div key={item.address}>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600">
                            {item.label}
                          </p>
                          <a
                            href={`mailto:${item.address}`}
                            className="mt-1 block text-sm text-green-400 underline-offset-4 hover:underline"
                          >
                            {item.address}
                          </a>
                        </div>
                      ))}
                    </div>
                  </GlowCard>
                </StaggerItem>
              </Stagger>
            </div>

            {/* Right — the form */}
            <div className="lg:col-span-3">
              <Reveal>
                <div className="relative rounded-xl bg-gradient-to-b from-green-500/25 via-zinc-700/30 to-zinc-800/30 p-px shadow-[0_0_80px_-16px_rgba(34,197,94,0.25)]">
                  <div className="rounded-[11px] bg-zinc-950/95 p-6 backdrop-blur-md sm:p-8">
                    {isSubmitted ? (
                      <div className="py-10 text-center">
                        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-green-500/30 bg-green-500/10 shadow-[0_0_40px_-8px_rgba(34,197,94,0.6)]">
                          <CheckCircle className="h-7 w-7 text-green-400" />
                        </span>
                        <h2 className="mt-5 font-sans text-xl font-bold tracking-tight text-zinc-100">
                          Message sent
                        </h2>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
                          <span className="text-green-400">$</span> echo
                          &quot;Thanks for reaching out! We&apos;ll get back to
                          you at <span className="text-green-400">{email}</span>{" "}
                          soon.&quot;
                        </p>
                        <button
                          onClick={() => {
                            setIsSubmitted(false);
                            setName("");
                            setEmail("");
                            setSubject("");
                            setMessage("");
                          }}
                          className="mt-7 rounded-lg border border-zinc-800 px-5 py-2.5 text-xs text-zinc-400 transition-colors hover:border-green-500/30 hover:text-zinc-200"
                        >
                          Send another message
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
                            <label
                              htmlFor="contact-name"
                              className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                            >
                              <span className="text-green-500">❯</span> Name
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
                              className={INPUT_CLASSES}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="contact-email"
                              className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                            >
                              <span className="text-green-500">❯</span> Email
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
                              className={INPUT_CLASSES}
                            />
                          </div>
                        </div>

                        {/* Subject */}
                        <div>
                          <label
                            htmlFor="contact-subject"
                            className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                          >
                            <span className="text-green-500">❯</span> Subject
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
                            className={INPUT_CLASSES}
                          />
                        </div>

                        {/* Message */}
                        <div>
                          <label
                            htmlFor="contact-message"
                            className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500"
                          >
                            <span className="text-green-500">❯</span> Message
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
                              <span className="animate-pulse">_</span> Sending…
                            </span>
                          ) : (
                            "Send message"
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
