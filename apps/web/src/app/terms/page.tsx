import Link from "next/link";
import type { Metadata } from "next";
import {
  MarketingShell,
  PageHero,
  GlowDivider,
  Reveal,
} from "@/components/marketing";
import { ScrollSpySidebar } from "@/components/ui/ScrollSpySidebar";

export const metadata: Metadata = {
  title: "Terms of Service | Envpilot",
  description:
    "Read the Envpilot Terms of Service governing your use of the platform, including billing, data ownership, and acceptable use policies.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  { id: "acceptance", label: "Acceptance" },
  { id: "definitions", label: "Definitions" },
  { id: "eligibility", label: "Eligibility" },
  { id: "accounts", label: "Accounts & Access" },
  { id: "acceptable-use", label: "Acceptable Use" },
  { id: "your-content", label: "Your Content" },
  { id: "billing", label: "Billing" },
  { id: "ip", label: "Intellectual Property" },
  { id: "privacy", label: "Privacy" },
  { id: "integrations", label: "Third-Party Integrations" },
  { id: "audit-logging", label: "Audit Logging" },
  { id: "availability", label: "Availability" },
  { id: "warranties", label: "Warranties" },
  { id: "liability", label: "Liability" },
  { id: "indemnification", label: "Indemnification" },
  { id: "termination", label: "Termination" },
  { id: "consumer-protection", label: "Consumer Protection" },
  { id: "governing-law", label: "Governing Law" },
  { id: "general", label: "General Provisions" },
  { id: "contact", label: "Contact" },
];

export default function TermsOfServicePage() {
  return (
    <MarketingShell>
      <PageHero eyebrow="terms" title="Terms of Service" align="left">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1.5 font-mono text-xs text-ink-muted">
          <span className="text-accent">&#10095;</span>
          Effective: March 10, 2026 &middot; Last updated: August 2, 2026
        </span>
      </PageHero>

      <GlowDivider />

      {/* Content with sidebar */}
      <section className="relative py-12 pb-24">
        <div className="mx-auto grid max-w-5xl gap-12 px-4 sm:px-6 lg:grid-cols-[14rem_1fr]">
          {/* Sidebar TOC — client island for scroll-spy */}
          <ScrollSpySidebar sections={SECTIONS} />

          {/* Main content — fully server-rendered */}
          <div className="min-w-0 font-mono text-sm leading-relaxed text-ink-muted">
            <Section id="acceptance" n={1} title="Acceptance of Terms">
              <p>
                These Terms of Service (&ldquo;Terms&rdquo;) constitute a
                legally binding agreement between you (&ldquo;User&rdquo;) and
                Envpilot (&ldquo;we,&rdquo; &ldquo;us&rdquo;) governing your use
                of the Envpilot platform, including the web application, CLI, VS
                Code extension, and all associated services (collectively, the
                &ldquo;Service&rdquo;).
              </p>
              <p className="mt-3">
                By creating an account or using the Service, you agree to be
                bound by these Terms. If you are using the Service on behalf of
                an organization, you represent that you have authority to bind
                that organization. If you do not agree, do not use the Service.
              </p>
            </Section>

            <Section id="definitions" n={2} title="Definitions">
              <div className="rounded-xl border border-line bg-surface/30 p-5">
                <ul className="space-y-2 pl-4">
                  <Li>
                    <Term>&ldquo;Organization&rdquo;</Term> &mdash; a workspace
                    containing projects, team members, and configuration data.
                  </Li>
                  <Li>
                    <Term>&ldquo;Project&rdquo;</Term> &mdash; a logical
                    grouping of environment variables within an Organization.
                  </Li>
                  <Li>
                    <Term>&ldquo;Variables&rdquo; / &ldquo;Secrets&rdquo;</Term>{" "}
                    &mdash; the environment variable key-value pairs you store
                    through the Service.
                  </Li>
                  <Li>
                    <Term>
                      &ldquo;Owner,&rdquo; &ldquo;Project Manager,&rdquo;
                      &ldquo;Team Lead,&rdquo; &ldquo;Developer&rdquo;
                    </Term>{" "}
                    &mdash; role-based access tiers within an Organization.
                  </Li>
                  <Li>
                    <Term>&ldquo;Content&rdquo;</Term> &mdash; any data, text,
                    or materials you upload, submit, or store through the
                    Service.
                  </Li>
                </ul>
              </div>
            </Section>

            <Section id="eligibility" n={3} title="Eligibility">
              <p>
                You must be at least 16 years old (or the minimum age in your
                jurisdiction) to use the Service. By using the Service, you
                represent that you meet this requirement and that your
                registration information is accurate and complete.
              </p>
            </Section>

            <Section id="accounts" n={4} title="Accounts and Access">
              <Subsection title="4.1 Account Registration">
                <p>
                  Authentication is managed through WorkOS AuthKit. You are
                  responsible for maintaining the confidentiality of your
                  credentials and for all activity under your account.
                </p>
              </Subsection>

              <Subsection title="4.2 CLI and Extension Access">
                <p>
                  Access tokens are stored locally on your device. You are
                  responsible for the security of any device on which tokens are
                  stored. If you believe a token has been compromised, revoke it
                  immediately through the web application.
                </p>
              </Subsection>

              <Subsection title="4.3 Roles and Permissions">
                <p>Unified organization-wide role-based access control:</p>
                <ul className="mt-2 space-y-1 pl-4">
                  <Li>
                    <Term>Owner:</Term> full access including rollback,
                    permission management, billing, and org settings.
                  </Li>
                  <Li>
                    <Term>Project Manager:</Term> full control of their assigned
                    projects, including members and variables.
                  </Li>
                  <Li>
                    <Term>Team Lead:</Term> manage variables and developer
                    access within their assigned projects.
                  </Li>
                  <Li>
                    <Term>Developer:</Term> work in assigned projects; variable
                    values require explicit per-variable access grants.
                  </Li>
                </ul>
                <p className="mt-2">
                  Organization Owners are responsible for managing roles and
                  ensuring appropriate access levels.
                </p>
              </Subsection>
            </Section>

            <Section id="acceptable-use" n={5} title="Acceptable Use">
              <p>
                You agree to use the Service only for lawful purposes. You shall
                not:
              </p>
              <ul className="mt-3 space-y-2 pl-4">
                <ProhibitedLi>
                  Store, transmit, or distribute unlawful, harmful, or abusive
                  content.
                </ProhibitedLi>
                <ProhibitedLi>
                  Attempt unauthorized access to any part of the Service or
                  other accounts.
                </ProhibitedLi>
                <ProhibitedLi>
                  Interfere with the Service through denial-of-service attacks,
                  scraping, or excessive API usage.
                </ProhibitedLi>
                <ProhibitedLi>
                  Reverse engineer, decompile, or disassemble the Service,
                  except where permitted by law.
                </ProhibitedLi>
                <ProhibitedLi>
                  Process content that infringes any third party&apos;s
                  intellectual property rights.
                </ProhibitedLi>
                <ProhibitedLi>
                  Resell or redistribute access to the Service without our
                  written consent.
                </ProhibitedLi>
                <ProhibitedLi>
                  Use the Service in any manner that could damage, disable, or
                  impair it for other users.
                </ProhibitedLi>
              </ul>
            </Section>

            <Section id="your-content" n={6} title="Your Content and Data">
              <Subsection title="6.1 Ownership">
                <p>
                  You retain all rights, title, and interest in your Content. We
                  do not claim ownership of your environment variables, project
                  configurations, or data.
                </p>
              </Subsection>

              <Subsection title="6.2 License to Us">
                <p>
                  You grant us a limited, non-exclusive, worldwide license to
                  host, store, transmit, encrypt, and display your Content
                  solely to provide the Service. This license terminates when
                  you delete your Content or close your account, subject to
                  backup retention periods.
                </p>
              </Subsection>

              <Subsection title="6.3 Data Security">
                <p>
                  Environment variable values are encrypted at rest using
                  end-to-end encryption in WorkOS Vault. Each
                  organization&apos;s secrets are encrypted with unique
                  cryptographic keys. Our database stores only encrypted vault
                  references, never plaintext values. You acknowledge that no
                  system is completely secure and should maintain your own
                  backups of critical data.
                </p>
              </Subsection>

              <Subsection title="6.4 Data Export">
                <p>
                  You may export your environment variables at any time through
                  the web application, CLI, or VS Code extension. We support
                  standard .env file format for portability.
                </p>
              </Subsection>
            </Section>

            <Section id="billing" n={7} title="Billing and Subscriptions">
              <Subsection title="7.1 Plans">
                <p>
                  The Service offers Free and Pro tiers. Features and limits for
                  each tier are displayed on the Usage &amp; Plan page in your
                  dashboard and may change. We will provide reasonable notice
                  before materially reducing features for paying subscribers.
                </p>
              </Subsection>

              <Subsection title="7.2 Payment">
                <p>
                  Pro subscriptions are billed monthly in advance through
                  Polar.sh, our payment processor. By subscribing, you authorize
                  us to charge your payment method at the start of each billing
                  cycle. The first charge occurs immediately upon subscription.
                  Subsequent charges occur on the same calendar date each month.
                  Fees are in U.S. dollars unless otherwise stated. Invoices,
                  receipts, billing history, and payment methods are available
                  in the customer portal hosted by Polar.sh, accessible from
                  Settings &rarr; Billing.
                </p>
              </Subsection>

              <Subsection title="7.3 Cancellation">
                <p>
                  You may cancel your Pro subscription at any time through
                  Settings &rarr; Billing in the dashboard. You will be asked to
                  select a brief cancellation reason (used solely to improve the
                  Service). Upon cancellation:
                </p>
                <div className="mt-3 rounded-xl border border-line bg-surface/30 p-5">
                  <ul className="space-y-2 pl-4">
                    <Li>
                      Your Pro access{" "}
                      <Term>
                        continues until the end of your current billing period
                      </Term>
                      . You have already paid for this period and will retain
                      full access throughout.
                    </Li>
                    <Li>
                      <Term>No further charges</Term> will be made after
                      cancellation. You will not be billed for the next billing
                      period.
                    </Li>
                    <Li>
                      After your billing period ends, a{" "}
                      <Term>7-day grace period</Term> begins during which Pro
                      features remain active. This gives you time to export data
                      or resubscribe.
                    </Li>
                    <Li>
                      After the grace period, your account reverts to the Free
                      tier. A 30-day cooldown prevents repeated abuse of grace
                      periods.
                    </Li>
                  </ul>
                </div>
              </Subsection>

              <Subsection title="7.4 Refund Policy">
                <p>
                  We do not provide prorated refunds for the current billing
                  period. When you cancel, you keep Pro access for the remainder
                  of the period you have already paid for &mdash; no money is
                  lost. Refunds may be issued where required by applicable
                  consumer protection law (see Section 17).
                </p>
              </Subsection>

              <Subsection title="7.5 Data After Downgrade">
                <p>
                  Your data is never deleted upon downgrade. If your resource
                  usage exceeds Free tier limits, existing resources remain
                  fully accessible but you will not be able to create new ones
                  until you are within limits. For example, if you have 10
                  projects and the Free limit is 3, all 10 remain accessible but
                  you cannot create an 11th project.
                </p>
              </Subsection>

              <Subsection title="7.6 Usage-Based Features">
                <p>
                  Certain features &mdash; including Secret Sharing (secure link
                  generation with email delivery) and Secret Rotation (automated
                  rotation with email alerts) &mdash; consume operational
                  resources and are subject to numeric limits based on your plan
                  tier. Current limits are displayed in real time on the Usage
                  &amp; Plan page.
                </p>
              </Subsection>

              <Subsection title="7.7 Taxes">
                <p>
                  Fees are exclusive of taxes. You are responsible for
                  applicable sales, use, VAT, GST, or similar taxes, except
                  where we are legally required to collect them.
                </p>
              </Subsection>
            </Section>

            <Section id="ip" n={8} title="Intellectual Property">
              <p>
                The Service, including its content (excluding your Content),
                features, functionality, design, code, and documentation, is and
                remains the exclusive property of Envpilot and its licensors.
                Protected by copyright, trademark, and other IP laws. Nothing in
                these Terms grants you any right to use the Envpilot name, logo,
                or trademarks without prior written consent.
              </p>
            </Section>

            <Section id="privacy" n={9} title="Privacy">
              <p>
                Your use of the Service is also governed by our{" "}
                <Link href="/privacy" className="text-accent hover:underline">
                  Privacy Policy
                </Link>
                , which describes how we collect, use, store, and protect your
                personal data. By using the Service, you consent to the
                practices described therein.
              </p>
            </Section>

            <Section id="integrations" n={10} title="Third-Party Integrations">
              <Subsection title="10.1 Connecting Slack and Discord">
                <p>
                  The Service allows authorized Organization members to connect
                  Slack channels and Discord channels as notification
                  destinations. By connecting a destination, you authorize
                  Envpilot to create or receive an incoming webhook credential
                  from the selected provider and to send Organization activity
                  notifications to that destination on your behalf.
                </p>
              </Subsection>

              <Subsection title="10.2 Notification Content">
                <p>
                  Integration notifications may include project names,
                  environment names, variable key names, access-request
                  activity, actor or key-owner identity, invitee or member email
                  addresses, shared-account names, API-key names, device names,
                  roles, and a link back to Envpilot. Envpilot does not include
                  environment variable or secret values in Slack or Discord
                  notifications.
                </p>
              </Subsection>

              <Subsection title="10.3 Your Responsibilities">
                <p>
                  You are responsible for selecting appropriate channels,
                  limiting channel membership, maintaining permission to use the
                  connected Slack workspace or Discord server, and ensuring that
                  notification recipients are authorized to view the project
                  metadata delivered there. You must not connect a destination
                  that you do not control or have permission to use.
                </p>
              </Subsection>

              <Subsection title="10.4 Provider Services and Disconnection">
                <p>
                  Slack and Discord are independent third-party services
                  governed by their own terms and privacy policies. We are not
                  responsible for provider outages, delivery delays, workspace
                  or server administration, or retention of messages already
                  delivered to a provider. You may pause or disconnect a
                  destination through Organization Settings. Disconnection stops
                  future delivery but does not delete messages previously
                  delivered to Slack or Discord.
                </p>
              </Subsection>
            </Section>

            <Section
              id="audit-logging"
              n={11}
              title="Audit Logging and Monitoring"
            >
              <p>
                All actions are recorded in audit logs, including action type,
                user identity, timestamp, IP address, and user-agent. Audit logs
                are retained for 2 years and accessible to Organization Owners.
                This monitoring is essential for security, compliance, and
                incident investigation.
              </p>
            </Section>

            <Section id="availability" n={12} title="Service Availability">
              <Subsection title="12.1 Availability">
                <p>
                  We use commercially reasonable efforts to maintain
                  availability but do not guarantee uninterrupted or error-free
                  operation. The Service may be temporarily unavailable for
                  maintenance, updates, or circumstances beyond our control.
                </p>
              </Subsection>

              <Subsection title="12.2 Modifications">
                <p>
                  We may modify, suspend, or discontinue any part of the Service
                  at any time. For material changes affecting paying
                  subscribers, we will provide at least 30 days&apos; notice.
                </p>
              </Subsection>
            </Section>

            <Section id="warranties" n={13} title="Disclaimer of Warranties">
              <div className="rounded-xl border border-warning-line bg-warning-soft p-5">
                <p className="text-xs uppercase tracking-wider text-warning">
                  THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                  AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER
                  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
                  WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                  PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
                  THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
                </p>
                <p className="mt-3 text-xs uppercase tracking-wider text-warning">
                  SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED
                  WARRANTIES. IN SUCH JURISDICTIONS, THE ABOVE EXCLUSIONS APPLY
                  TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW.
                </p>
              </div>
            </Section>

            <Section id="liability" n={14} title="Limitation of Liability">
              <div className="rounded-xl border border-warning-line bg-warning-soft p-5">
                <p className="text-xs uppercase tracking-wider text-warning">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, ENVPILOT SHALL NOT BE
                  LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                  OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, USE,
                  GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE
                  OF THE SERVICE, UNAUTHORIZED ACCESS TO YOUR DATA, THIRD-PARTY
                  CONDUCT, LOSS OF VARIABLES OR SECRETS, OR ANY OTHER MATTER
                  RELATING TO THE SERVICE.
                </p>
                <p className="mt-3 text-xs uppercase tracking-wider text-warning">
                  OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF
                  (A) AMOUNTS YOU PAID IN THE 12 MONTHS PRECEDING THE CLAIM, OR
                  (B) USD $100.
                </p>
                <p className="mt-3 text-xs uppercase tracking-wider text-warning">
                  THESE LIMITATIONS APPLY REGARDLESS OF THE THEORY OF LIABILITY
                  AND EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. SOME
                  JURISDICTIONS DO NOT ALLOW LIMITATIONS ON LIABILITY; THESE
                  APPLY TO THE FULLEST EXTENT PERMITTED.
                </p>
              </div>
            </Section>

            <Section id="indemnification" n={15} title="Indemnification">
              <p>
                You agree to indemnify, defend, and hold harmless Envpilot and
                its officers, directors, employees, agents, and licensors from
                claims, liabilities, damages, losses, and expenses (including
                legal fees) arising from: (a) your use of the Service; (b)
                violation of these Terms; (c) violation of third-party rights;
                or (d) your Content.
              </p>
            </Section>

            <Section id="termination" n={16} title="Term and Termination">
              <Subsection title="16.1 Term">
                <p>
                  These Terms remain in effect while you have an account with
                  the Service.
                </p>
              </Subsection>

              <Subsection title="16.2 Termination by You">
                <p>
                  You may terminate your account at any time. We will delete
                  your personal data within 30 days, subject to retention
                  obligations described in our Privacy Policy.
                </p>
              </Subsection>

              <Subsection title="16.3 Termination by Us">
                <p>
                  We may suspend or terminate your access immediately if: (a)
                  you breach these Terms; (b) required by law; (c) your account
                  is inactive for an extended period; or (d) we discontinue the
                  Service. We will make reasonable efforts to provide notice,
                  except where immediate action is required for security or
                  legal reasons.
                </p>
              </Subsection>

              <Subsection title="16.4 Effect of Termination">
                <p>
                  Upon termination, your right to use the Service ceases
                  immediately. Provisions that by their nature should survive
                  termination&mdash;including ownership, intellectual property,
                  privacy, disclaimers, limitations of liability,
                  indemnification, consumer protection, dispute resolution, and
                  general provisions&mdash;will survive.
                </p>
              </Subsection>
            </Section>

            <Section
              id="consumer-protection"
              n={17}
              title="Consumer Protection"
            >
              <Subsection title="17.1 EU and UK">
                <p>
                  If you are a consumer in the EU or UK, nothing in these Terms
                  affects your statutory rights under mandatory consumer
                  protection laws, including the Consumer Rights Act 2015 (UK)
                  and the Consumer Rights Directive (EU). Mandatory provisions
                  prevail over conflicting Terms.
                </p>
              </Subsection>

              <Subsection title="17.2 Australia and New Zealand">
                <p>
                  If you are a consumer under the Australian Consumer Law or NZ
                  Consumer Guarantees Act 1993, you have certain non-excludable
                  rights. Nothing in these Terms is intended to exclude,
                  restrict, or modify those rights.
                </p>
              </Subsection>

              <Subsection title="17.3 Japan">
                <p>
                  If you are a consumer in Japan, the Consumer Contract Act (Act
                  No. 61 of 2000) applies to the extent that it cannot be
                  excluded by contract.
                </p>
              </Subsection>
            </Section>

            <Section
              id="governing-law"
              n={18}
              title="Governing Law and Disputes"
            >
              <Subsection title="18.1 Governing Law">
                <p>
                  These Terms are governed by the laws of the State of Delaware,
                  United States, without regard to conflict of law provisions.
                  EU/UK consumers retain the protection of mandatory local law.
                </p>
              </Subsection>

              <Subsection title="18.2 Dispute Resolution">
                <p>
                  Before initiating legal proceedings, you agree to attempt
                  informal resolution by contacting{" "}
                  <a
                    href="mailto:legal@envpilot.dev"
                    className="text-accent hover:underline"
                  >
                    legal@envpilot.dev
                  </a>
                  . If unresolved after 30 days, either party may pursue binding
                  arbitration under the AAA rules, or bring claims in small
                  claims court if eligible.
                </p>
              </Subsection>

              <Subsection title="18.3 Class Action Waiver">
                <div className="rounded-xl border border-warning-line bg-warning-soft p-5">
                  <p className="text-xs uppercase tracking-wider text-warning">
                    TO THE EXTENT PERMITTED BY LAW, YOU AND ENVPILOT EACH WAIVE
                    THE RIGHT TO PARTICIPATE IN A CLASS ACTION, COLLECTIVE
                    ACTION, OR OTHER REPRESENTATIVE PROCEEDING. THIS WAIVER DOES
                    NOT APPLY IF PROHIBITED BY YOUR JURISDICTION&apos;S LAW.
                  </p>
                </div>
              </Subsection>

              <Subsection title="18.4 EU/UK Consumers">
                <p>
                  EU consumers may bring proceedings before local courts and use
                  the European Commission&apos;s Online Dispute Resolution
                  platform. UK consumers may bring proceedings in the courts of
                  England and Wales, Scotland, or Northern Ireland.
                </p>
              </Subsection>
            </Section>

            <Section id="general" n={19} title="General Provisions">
              <Subsection title="19.1 Entire Agreement">
                <p>
                  These Terms, together with our Privacy Policy, constitute the
                  entire agreement between you and Envpilot regarding the
                  Service.
                </p>
              </Subsection>

              <Subsection title="19.2 Severability">
                <p>
                  If any provision is held invalid or unenforceable, it will be
                  enforced to the maximum extent permissible, and the remaining
                  provisions remain in full force.
                </p>
              </Subsection>

              <Subsection title="19.3 Waiver">
                <p>
                  Our failure to enforce any right or provision will not
                  constitute a waiver of that right or provision.
                </p>
              </Subsection>

              <Subsection title="19.4 Assignment">
                <p>
                  You may not assign these Terms without our written consent. We
                  may assign without restriction.
                </p>
              </Subsection>

              <Subsection title="19.5 Force Majeure">
                <p>
                  Neither party is liable for failure or delay due to causes
                  beyond reasonable control, including natural disasters, war,
                  pandemics, governmental actions, power failures, internet
                  failures, or cyberattacks.
                </p>
              </Subsection>

              <Subsection title="19.6 Changes to These Terms">
                <p>
                  We may modify these Terms at any time. We will notify you of
                  material changes at least 30 days before they take effect.
                  Continued use after the effective date constitutes acceptance.
                </p>
              </Subsection>
            </Section>

            <Section id="contact" n={20} title="Contact">
              <p>For questions about these Terms:</p>
              <div className="mt-4 rounded-xl border border-line bg-surface/30 p-5">
                <p className="flex items-center gap-2 text-ink">
                  <span className="text-accent">&#10095;</span>
                  <strong className="font-semibold">Envpilot Legal</strong>
                </p>
                <p className="mt-2">
                  Email:{" "}
                  <a
                    href="mailto:legal@envpilot.dev"
                    className="text-accent hover:underline"
                  >
                    legal@envpilot.dev
                  </a>
                </p>
              </div>
            </Section>
          </div>
        </div>
      </section>
    </MarketingShell>
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
      className="scroll-mt-24 border-b border-line py-10 first:pt-0 last:border-b-0"
    >
      <Reveal>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs tracking-widest text-accent">
            &sect; {String(n).padStart(2, "0")}
          </span>
          <h2 className="font-sans text-xl font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        <div className="mt-4">{children}</div>
      </Reveal>
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h3 className="font-sans text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** List item with a green caret marker. */
function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-ink-muted before:mr-2 before:text-accent before:content-['\276F']">
      {children}
    </li>
  );
}

/** List item for prohibited actions — red "x" marker. */
function ProhibitedLi({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-ink-muted before:mr-2 before:text-danger before:content-['x']">
      {children}
    </li>
  );
}

/** Emphasized key term inside legal prose. */
function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-ink">{children}</strong>;
}
