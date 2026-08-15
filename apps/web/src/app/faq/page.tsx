import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, PageHero, terminal } from "@/components/marketing";
import { ScrollSpySidebar } from "@/components/ui/ScrollSpySidebar";
import { FAQAccordion } from "@/components/faq/FAQAccordion";
import { jsonLdScript } from "@/lib/json-ld";

export const metadata: Metadata = {
  title: "FAQ | Envpilot",
  description:
    "Frequently asked questions about Envpilot. Learn about plans, billing, security, usage limits, and features.",
  alternates: { canonical: "/faq" },
};

const SECTIONS = [
  { id: "getting-started", label: "Getting Started" },
  { id: "plans-billing", label: "Plans & Billing" },
  { id: "usage-limits", label: "Usage & Limits" },
  { id: "security-data", label: "Security & Data" },
  { id: "features", label: "Features" },
  { id: "account-support", label: "Account & Support" },
];

const FAQ_DATA = [
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
        answer:
          'Visit envpilot.dev and click "Get Started." Authentication is handled securely through WorkOS AuthKit — you can sign in with email or supported SSO providers.',
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
        answer:
          "Envpilot offers two plans: Free (essential features, limited resources) and Pro ($15/month, unlimited resources and advanced features). See the Usage & Plan page in your dashboard for a full comparison.",
      },
      {
        question: "How does billing work?",
        answer:
          "Pro subscriptions are billed monthly in advance through Polar.sh, our payment processor. When you subscribe, you are charged immediately for the first billing period. Subsequent charges occur on the same date each month.",
      },
      {
        question: "Can I cancel my subscription?",
        answer:
          "Yes, you can cancel at any time from Settings → Billing (or via the Manage billing link on the Usage & Plan page). You'll be asked to select a short reason for canceling — this feedback helps us improve the product. When you cancel, your Pro access continues until the end of your current billing period. After that, a 7-day grace period begins where you retain Pro features while you decide. After the grace period, your account reverts to the Free tier.",
      },
      {
        question: "Where can I see my invoices and billing history?",
        answer:
          "Settings → Billing → Open Portal (or View Invoices) takes you to your secure customer portal hosted by Polar.sh, our payment processor. There you can download invoices and receipts, view your full billing history, and update your payment method.",
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
        answer:
          "Projects (total active), Team Members (per org), Variables per Project, Pending Invitations, Active Share Links, Rotation-Enabled Variables, Audit Log Retention (7 days Free, 365 days Pro), and Analytics Retention (7 days Free, 30 days Pro).",
      },
      {
        question: "What happens when I hit a limit?",
        answer:
          "When you reach a resource limit, you cannot create more of that resource until you either remove existing ones or upgrade to Pro. Existing resources are never deleted or restricted — only new creation is blocked.",
      },
      {
        question: "Are usage counts real-time?",
        answer:
          "Yes. All usage counts are computed in real time from your actual data — there are no cached or delayed counters. When you delete a project or remove a team member, the count updates immediately.",
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
          "Every action in Envpilot is recorded in an audit log — variable reads, writes, deletions, team changes, permission updates, and more. Audit logs include the action type, user identity, timestamp, IP address, and user agent. Free tier retains logs for 7 days; Pro tier for 365 days.",
      },
      {
        question: "Who can access my variables?",
        answer:
          "Access is controlled through unified organization roles (Owner, Project Manager, Team Lead, Developer) and optional per-variable granular permissions. Only explicitly authorized users can view or modify variables. All access is audit logged.",
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
          "Secret Sharing lets you generate secure, time-limited links to share individual variables with anyone — even people outside your organization. Links can be set to expire after a single view or a specific time period. This feature uses email notifications and is available on the Pro plan.",
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
        answer:
          "CLI (npx envpilot) for terminal management, VS Code Extension for real-time sync in your editor, and API Access for CI/CD pipelines and automation.",
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
        answer:
          "Visit envpilot.dev/support to submit a support ticket, or email support@envpilot.dev. We typically respond within 24 hours on business days. Pro plan users receive priority support with faster response times.",
      },
      {
        question: "Can I transfer my organization?",
        answer:
          "Yes. Organization admins can transfer ownership to another admin member through Organization Settings → Danger Zone.",
      },
      {
        question: "How do I delete my account?",
        answer:
          "Contact support@envpilot.dev to request account deletion. We will remove your personal data in accordance with our Privacy Policy and applicable data protection laws.",
      },
    ],
  },
];

// FAQ rich results in Google search, generated from the same data the page
// renders so the two can't drift apart.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_DATA.flatMap((section) =>
    section.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    }))
  ),
};

export default function FAQPage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema) }}
      />
      <PageHero
        eyebrow="faq"
        title="Questions, answered."
        description={
          <>
            Everything you need to know about Envpilot. Can&apos;t find your
            answer?{" "}
            <Link
              href="/support"
              className="text-accent underline-offset-4 hover:underline"
            >
              Contact support
            </Link>
            .
          </>
        }
      />

      <section className="pb-24">
        <div className={`${terminal.shell} flex gap-12`}>
          {/* Sidebar TOC — client island for scroll-spy */}
          <ScrollSpySidebar sections={SECTIONS} />

          {/* FAQ content — client island for accordion toggle */}
          <FAQAccordion sections={FAQ_DATA} />
        </div>
      </section>
    </MarketingShell>
  );
}
