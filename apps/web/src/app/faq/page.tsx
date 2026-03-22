"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { PublicHeaderButtons } from "@/components/landing/PublicHeaderButtons";

const SECTIONS = [
  { id: "getting-started", label: "Getting Started" },
  { id: "plans-billing", label: "Plans & Billing" },
  { id: "usage-limits", label: "Usage & Limits" },
  { id: "security-data", label: "Security & Data" },
  { id: "features", label: "Features" },
  { id: "account-support", label: "Account & Support" },
];

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

interface FAQSection {
  id: string;
  n: number;
  title: string;
  items: FAQItem[];
}

const FAQ_DATA: FAQSection[] = [
  {
    id: "getting-started",
    n: 1,
    title: "Getting Started",
    items: [
      {
        question: "What is Envpilot?",
        answer:
          "Envpilot is a secure environment variable management platform for development teams. It lets you store, sync, and manage environment variables across your projects with a web dashboard, CLI, and VS Code extension.",
      },
      {
        question: "How do I create an account?",
        answer: (
          <>
            Visit{" "}
            <a
              href="https://envpilot.dev"
              className="text-green-400 hover:underline"
            >
              envpilot.dev
            </a>{" "}
            and click &ldquo;Get Started.&rdquo; Authentication is handled
            securely through WorkOS AuthKit &mdash; you can sign in with email
            or supported SSO providers.
          </>
        ),
      },
      {
        question: "What is an Organization?",
        answer:
          "An Organization is your team workspace. It contains projects, team members, and all configuration data. Every user starts with one organization on the Free tier.",
      },
    ],
  },
  {
    id: "plans-billing",
    n: 2,
    title: "Plans & Billing",
    items: [
      {
        question: "What plans are available?",
        answer: (
          <>
            Envpilot offers two plans:{" "}
            <span className="text-zinc-300">Free</span> (essential features,
            limited resources) and <span className="text-zinc-300">Pro</span>{" "}
            ($15/month, unlimited resources and advanced features). See the
            Usage &amp; Plan page in your dashboard for a full comparison.
          </>
        ),
      },
      {
        question: "How does billing work?",
        answer:
          "Pro subscriptions are billed monthly in advance through Polar.sh, our payment processor. When you subscribe, you are charged immediately for the first billing period. Subsequent charges occur on the same date each month.",
      },
      {
        question: "Can I cancel my subscription?",
        answer:
          "Yes, you can cancel at any time from Account Settings \u2192 Billing. When you cancel, your Pro access continues until the end of your current billing period. After that, a 7-day grace period begins where you retain Pro features while you decide. After the grace period, your account reverts to the Free tier.",
      },
      {
        question: "Do you offer refunds?",
        answer:
          "We do not provide prorated refunds for the current billing period. When you cancel, you keep Pro access for the remainder of the period you already paid for. No further charges will occur. Refunds may be issued where required by applicable consumer protection law.",
      },
      {
        question: "What happens to my data if I downgrade?",
        answer:
          "Your data is never deleted. If you exceed Free tier limits after downgrading, existing resources remain intact but you cannot create new ones until you are within limits. For example, if you have 10 projects and the Free limit is 3, all 10 remain accessible but you cannot create an 11th.",
      },
      {
        question: "What is the grace period?",
        answer:
          "After your Pro subscription ends (cancellation or payment failure), you get a 7-day grace period where all Pro features remain active. This gives you time to export data, adjust workflows, or resubscribe. A 30-day cooldown prevents repeated abuse of grace periods.",
      },
    ],
  },
  {
    id: "usage-limits",
    n: 3,
    title: "Usage & Limits",
    items: [
      {
        question: "How do usage meters work?",
        answer:
          "Usage meters track your consumption of limited resources in real time. Each resource (projects, team members, variables per project, etc.) has a limit based on your plan tier. The Usage & Plan page in your dashboard shows your current consumption against these limits.",
      },
      {
        question: "What resources are metered?",
        answer: (
          <ul className="space-y-2 pl-4">
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Projects</span> &mdash; total
              active projects in your organization.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Team Members</span> &mdash;
              members in your organization.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Variables per Project</span>{" "}
              &mdash; environment variables in each project (counted
              per-project, not total).
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Pending Invitations</span> &mdash;
              outstanding team invites.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Active Share Links</span> &mdash;
              currently active secret sharing links.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Rotation-Enabled Variables</span>{" "}
              &mdash; variables with automated rotation configured.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Audit Log Retention</span> &mdash;
              how long audit logs are kept (7 days Free, 365 days Pro).
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">Analytics Retention</span> &mdash;
              how long analytics data is stored (7 days Free, 30 days Pro).
            </li>
          </ul>
        ),
      },
      {
        question: "What happens when I hit a limit?",
        answer:
          "When you reach a resource limit, you cannot create more of that resource until you either remove existing ones or upgrade to Pro. Existing resources are never deleted or restricted \u2014 only new creation is blocked.",
      },
      {
        question: "Are usage counts real-time?",
        answer:
          "Yes. All usage counts are computed in real time from your actual data \u2014 there are no cached or delayed counters. When you delete a project or remove a team member, the count updates immediately.",
      },
    ],
  },
  {
    id: "security-data",
    n: 4,
    title: "Security & Data",
    items: [
      {
        question: "How is my data secured?",
        answer:
          "All environment variables are encrypted at rest and in transit. We use AES-256 encryption for stored values and TLS 1.2+ for all network communication. Authentication is handled by WorkOS AuthKit, and all API access requires valid session tokens.",
      },
      {
        question: "Where is my data stored?",
        answer:
          "Data is stored in Convex, a real-time database with built-in encryption and automatic backups. Infrastructure is hosted on enterprise-grade cloud providers with SOC 2 compliance.",
      },
      {
        question: "What is audit logging?",
        answer:
          "Every action in Envpilot is recorded in an audit log \u2014 variable reads, writes, deletions, team changes, permission updates, and more. Audit logs include the action type, user identity, timestamp, IP address, and user agent. Free tier retains logs for 7 days; Pro tier for 365 days.",
      },
      {
        question: "Who can access my variables?",
        answer:
          "Access is controlled through role-based permissions (Admin, Team Lead, Member) and optional per-variable granular permissions. Only explicitly authorized users can view or modify variables. All access is audit logged.",
      },
    ],
  },
  {
    id: "features",
    n: 5,
    title: "Features",
    items: [
      {
        question: "What is Secret Sharing?",
        answer:
          "Secret Sharing lets you generate secure, time-limited links to share individual variables with anyone \u2014 even people outside your organization. Links can be set to expire after a single view or a specific time period. This feature uses email notifications and is available on the Pro plan.",
      },
      {
        question: "What is Secret Rotation?",
        answer:
          "Secret Rotation automates the process of rotating (changing) sensitive variables on a schedule. You set an expiry period, and Envpilot notifies you (via email) when a variable needs rotation. This helps maintain security hygiene. Available on Pro plan.",
      },
      {
        question: "Why are Secret Sharing and Rotation Pro-only?",
        answer:
          "Both features rely on email delivery infrastructure (notifications, sharing links, rotation alerts), which has significant operational cost. The Pro plan covers these costs while keeping the Free tier sustainable.",
      },
      {
        question: "What developer tools are available?",
        answer: (
          <ul className="space-y-2 pl-4">
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">CLI</span> (
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-green-400">
                npx envpilot
              </code>
              ) &mdash; manage variables from your terminal.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">VS Code Extension</span> &mdash;
              sync and edit variables directly in your editor.
            </li>
            <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
              <span className="text-zinc-300">API Access</span> &mdash;
              programmatic access for CI/CD pipelines and automation.
            </li>
          </ul>
        ),
      },
      {
        question: "What is Version History?",
        answer:
          "Version History tracks every change to your environment variables, including who changed what and when. You can view previous values and roll back to any prior version. Available on Pro plan.",
      },
    ],
  },
  {
    id: "account-support",
    n: 6,
    title: "Account & Support",
    items: [
      {
        question: "How do I contact support?",
        answer: (
          <>
            Visit{" "}
            <Link href="/support" className="text-green-400 hover:underline">
              envpilot.dev/support
            </Link>{" "}
            to submit a support ticket, or email{" "}
            <a
              href="mailto:support@envpilot.dev"
              className="text-green-400 hover:underline"
            >
              support@envpilot.dev
            </a>
            . We typically respond within 24 hours on business days. Pro plan
            users receive priority support with faster response times.
          </>
        ),
      },
      {
        question: "Can I transfer my organization?",
        answer:
          "Yes. Organization admins can transfer ownership to another admin member through Organization Settings \u2192 Danger Zone.",
      },
      {
        question: "How do I delete my account?",
        answer: (
          <>
            Contact{" "}
            <a
              href="mailto:support@envpilot.dev"
              className="text-green-400 hover:underline"
            >
              support@envpilot.dev
            </a>{" "}
            to request account deletion. We will remove your personal data in
            accordance with our{" "}
            <Link href="/privacy" className="text-green-400 hover:underline">
              Privacy Policy
            </Link>{" "}
            and applicable data protection laws.
          </>
        ),
      },
    ],
  },
];

export default function FAQPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  function toggleItem(key: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

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
            <PublicHeaderButtons />
          </div>
        </div>
      </header>

      <main className="pt-14">
        {/* Hero */}
        <section className="border-b border-zinc-800/50 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <p className="text-xs uppercase tracking-widest text-green-500">
              {"// help"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              Frequently Asked Questions
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Everything you need to know about Envpilot &middot; Can&apos;t
              find your answer?{" "}
              <Link href="/support" className="text-green-400 hover:underline">
                Contact support
              </Link>
            </p>
          </div>
        </section>

        {/* Content with sidebar */}
        <section className="py-12">
          <div className="mx-auto flex max-w-5xl gap-12 px-4">
            {/* Sidebar TOC */}
            <nav className="hidden w-48 shrink-0 lg:block">
              <div className="sticky top-20">
                <p className="mb-3 text-[10px] uppercase tracking-widest text-zinc-600">
                  on this page
                </p>
                <ul className="space-y-1">
                  {SECTIONS.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className={`block py-1 text-xs transition-colors ${
                          activeSection === s.id
                            ? "text-green-400"
                            : "text-zinc-600 hover:text-zinc-400"
                        }`}
                      >
                        {activeSection === s.id && (
                          <span className="mr-1">&gt;</span>
                        )}
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            {/* Main content */}
            <div className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-400">
              {FAQ_DATA.map((section) => (
                <Section
                  key={section.id}
                  id={section.id}
                  n={section.n}
                  title={section.title}
                >
                  <div className="space-y-2">
                    {section.items.map((item, idx) => {
                      const itemKey = `${section.id}-${idx}`;
                      const isOpen = openItems.has(itemKey);
                      return (
                        <div
                          key={itemKey}
                          className="rounded-lg border border-zinc-800/50 bg-zinc-900/30"
                        >
                          <button
                            onClick={() => toggleItem(itemKey)}
                            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-zinc-800/30"
                          >
                            <span className="text-sm text-zinc-200">
                              {item.question}
                            </span>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`shrink-0 text-green-500 transition-transform duration-200 ${
                                isOpen ? "rotate-180" : ""
                              }`}
                            >
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                          {isOpen && (
                            <div className="border-t border-zinc-800/50 px-4 py-3 text-sm leading-relaxed text-zinc-400">
                              {item.answer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>
              ))}
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

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-b border-zinc-800/50 py-8 first:pt-0 last:border-b-0"
    >
      <h2 className="text-base font-semibold text-zinc-100">
        <span className="text-green-500">{String(n).padStart(2, "0")}.</span>{" "}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
