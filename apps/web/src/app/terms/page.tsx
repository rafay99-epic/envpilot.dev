"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

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
  const [activeSection, setActiveSection] = useState("acceptance");

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
              {"// legal"}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-100 md:text-4xl">
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Effective: March 10, 2026 &middot; Last updated: March 10, 2026
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
              <Section id="acceptance" n={1} title="Acceptance of Terms">
                <p>
                  These Terms of Service (&ldquo;Terms&rdquo;) constitute a
                  legally binding agreement between you (&ldquo;User&rdquo;) and
                  Envpilot (&ldquo;we,&rdquo; &ldquo;us&rdquo;) governing your
                  use of the Envpilot platform, including the web application,
                  CLI, VS Code extension, and all associated services
                  (collectively, the &ldquo;Service&rdquo;).
                </p>
                <p className="mt-3">
                  By creating an account or using the Service, you agree to be
                  bound by these Terms. If you are using the Service on behalf
                  of an organization, you represent that you have authority to
                  bind that organization. If you do not agree, do not use the
                  Service.
                </p>
              </Section>

              <Section id="definitions" n={2} title="Definitions">
                <ul className="space-y-2 pl-4">
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      &ldquo;Organization&rdquo;
                    </span>{" "}
                    &mdash; a workspace containing projects, team members, and
                    configuration data.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">&ldquo;Project&rdquo;</span>{" "}
                    &mdash; a logical grouping of environment variables within
                    an Organization.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      &ldquo;Variables&rdquo; / &ldquo;Secrets&rdquo;
                    </span>{" "}
                    &mdash; the environment variable key-value pairs you store
                    through the Service.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      &ldquo;Admin,&rdquo; &ldquo;Team Lead,&rdquo;
                      &ldquo;Member&rdquo;
                    </span>{" "}
                    &mdash; role-based access tiers within an Organization.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">&ldquo;Content&rdquo;</span>{" "}
                    &mdash; any data, text, or materials you upload, submit, or
                    store through the Service.
                  </li>
                </ul>
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
                    responsible for the security of any device on which tokens
                    are stored. If you believe a token has been compromised,
                    revoke it immediately through the web application.
                  </p>
                </Subsection>

                <Subsection title="4.3 Roles and Permissions">
                  <p>Three-tier role-based access control:</p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Admin:</span> full access
                      including rollback, permission management, billing, and
                      org settings.
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Team Lead:</span> manage
                      projects and variables, grant/revoke per-variable access.
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Member:</span> read-only
                      projects; requires explicit per-variable permission
                      grants.
                    </li>
                  </ul>
                  <p className="mt-2">
                    Organization Admins are responsible for managing roles and
                    ensuring appropriate access levels.
                  </p>
                </Subsection>
              </Section>

              <Section id="acceptable-use" n={5} title="Acceptable Use">
                <p>
                  You agree to use the Service only for lawful purposes. You
                  shall not:
                </p>
                <ul className="mt-3 space-y-2 pl-4">
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Store, transmit, or distribute unlawful, harmful, or abusive
                    content.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Attempt unauthorized access to any part of the Service or
                    other accounts.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Interfere with the Service through denial-of-service
                    attacks, scraping, or excessive API usage.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Reverse engineer, decompile, or disassemble the Service,
                    except where permitted by law.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Process content that infringes any third party&apos;s
                    intellectual property rights.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Resell or redistribute access to the Service without our
                    written consent.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-red-400 before:content-['x']">
                    Use the Service in any manner that could damage, disable, or
                    impair it for other users.
                  </li>
                </ul>
              </Section>

              <Section id="your-content" n={6} title="Your Content and Data">
                <Subsection title="6.1 Ownership">
                  <p>
                    You retain all rights, title, and interest in your Content.
                    We do not claim ownership of your environment variables,
                    project configurations, or data.
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
                    You may export your environment variables at any time
                    through the web application, CLI, or VS Code extension. We
                    support standard .env file format for portability.
                  </p>
                </Subsection>
              </Section>

              <Section id="billing" n={7} title="Billing and Subscriptions">
                <Subsection title="7.1 Plans">
                  <p>
                    The Service offers Free and Pro tiers. Features and limits
                    for each tier are on our pricing page and may change. We
                    will provide reasonable notice before materially reducing
                    features for paying subscribers.
                  </p>
                </Subsection>

                <Subsection title="7.2 Payment">
                  <p>
                    Paid subscriptions are billed in advance (monthly or
                    annually) through Stripe. By subscribing, you authorize us
                    to charge your payment method at the start of each billing
                    cycle. Fees are in U.S. dollars unless otherwise stated.
                  </p>
                </Subsection>

                <Subsection title="7.3 Cancellation and Refunds">
                  <p>
                    You may cancel at any time through organization settings.
                    Your subscription remains active until the end of the
                    current billing period, then reverts to Free tier. We do not
                    provide prorated refunds unless required by applicable law.
                  </p>
                </Subsection>

                <Subsection title="7.4 Taxes">
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
                  features, functionality, design, code, and documentation, is
                  and remains the exclusive property of Envpilot and its
                  licensors. Protected by copyright, trademark, and other IP
                  laws. Nothing in these Terms grants you any right to use the
                  Envpilot name, logo, or trademarks without prior written
                  consent.
                </p>
              </Section>

              <Section id="privacy" n={9} title="Privacy">
                <p>
                  Your use of the Service is also governed by our{" "}
                  <Link
                    href="/privacy"
                    className="text-green-400 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  , which describes how we collect, use, store, and protect your
                  personal data. By using the Service, you consent to the
                  practices described therein.
                </p>
              </Section>

              <Section
                id="audit-logging"
                n={10}
                title="Audit Logging and Monitoring"
              >
                <p>
                  All actions are recorded in audit logs, including action type,
                  user identity, timestamp, IP address, and user-agent. Audit
                  logs are retained for 2 years and accessible to Organization
                  Admins. This monitoring is essential for security, compliance,
                  and incident investigation.
                </p>
              </Section>

              <Section id="availability" n={11} title="Service Availability">
                <Subsection title="11.1 Availability">
                  <p>
                    We use commercially reasonable efforts to maintain
                    availability but do not guarantee uninterrupted or
                    error-free operation. The Service may be temporarily
                    unavailable for maintenance, updates, or circumstances
                    beyond our control.
                  </p>
                </Subsection>

                <Subsection title="11.2 Modifications">
                  <p>
                    We may modify, suspend, or discontinue any part of the
                    Service at any time. For material changes affecting paying
                    subscribers, we will provide at least 30 days&apos; notice.
                  </p>
                </Subsection>
              </Section>

              <Section id="warranties" n={12} title="Disclaimer of Warranties">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-xs uppercase tracking-wider text-amber-400">
                    THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                    AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER
                    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED
                    WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                    PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
                    THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-wider text-amber-400">
                    SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED
                    WARRANTIES. IN SUCH JURISDICTIONS, THE ABOVE EXCLUSIONS
                    APPLY TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW.
                  </p>
                </div>
              </Section>

              <Section id="liability" n={13} title="Limitation of Liability">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-xs uppercase tracking-wider text-amber-400">
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, ENVPILOT SHALL NOT
                    BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                    CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
                    PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES,
                    RESULTING FROM YOUR USE OF THE SERVICE, UNAUTHORIZED ACCESS
                    TO YOUR DATA, THIRD-PARTY CONDUCT, LOSS OF VARIABLES OR
                    SECRETS, OR ANY OTHER MATTER RELATING TO THE SERVICE.
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-wider text-amber-400">
                    OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER
                    OF (A) AMOUNTS YOU PAID IN THE 12 MONTHS PRECEDING THE
                    CLAIM, OR (B) USD $100.
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-wider text-amber-400">
                    THESE LIMITATIONS APPLY REGARDLESS OF THE THEORY OF
                    LIABILITY AND EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
                    DAMAGES. SOME JURISDICTIONS DO NOT ALLOW LIMITATIONS ON
                    LIABILITY; THESE APPLY TO THE FULLEST EXTENT PERMITTED.
                  </p>
                </div>
              </Section>

              <Section id="indemnification" n={14} title="Indemnification">
                <p>
                  You agree to indemnify, defend, and hold harmless Envpilot and
                  its officers, directors, employees, agents, and licensors from
                  claims, liabilities, damages, losses, and expenses (including
                  legal fees) arising from: (a) your use of the Service; (b)
                  violation of these Terms; (c) violation of third-party rights;
                  or (d) your Content.
                </p>
              </Section>

              <Section id="termination" n={15} title="Term and Termination">
                <Subsection title="15.1 Term">
                  <p>
                    These Terms remain in effect while you have an account with
                    the Service.
                  </p>
                </Subsection>

                <Subsection title="15.2 Termination by You">
                  <p>
                    You may terminate your account at any time. We will delete
                    your personal data within 30 days, subject to retention
                    obligations described in our Privacy Policy.
                  </p>
                </Subsection>

                <Subsection title="15.3 Termination by Us">
                  <p>
                    We may suspend or terminate your access immediately if: (a)
                    you breach these Terms; (b) required by law; (c) your
                    account is inactive for an extended period; or (d) we
                    discontinue the Service. We will make reasonable efforts to
                    provide notice, except where immediate action is required
                    for security or legal reasons.
                  </p>
                </Subsection>

                <Subsection title="15.4 Effect of Termination">
                  <p>
                    Upon termination, your right to use the Service ceases
                    immediately. Sections that by nature should survive
                    (including Sections 6.1, 8, 12, 13, 14, 17, and 18) will
                    survive.
                  </p>
                </Subsection>
              </Section>

              <Section
                id="consumer-protection"
                n={16}
                title="Consumer Protection"
              >
                <Subsection title="16.1 EU and UK">
                  <p>
                    If you are a consumer in the EU or UK, nothing in these
                    Terms affects your statutory rights under mandatory consumer
                    protection laws, including the Consumer Rights Act 2015 (UK)
                    and the Consumer Rights Directive (EU). Mandatory provisions
                    prevail over conflicting Terms.
                  </p>
                </Subsection>

                <Subsection title="16.2 Australia and New Zealand">
                  <p>
                    If you are a consumer under the Australian Consumer Law or
                    NZ Consumer Guarantees Act 1993, you have certain
                    non-excludable rights. Nothing in these Terms is intended to
                    exclude, restrict, or modify those rights.
                  </p>
                </Subsection>

                <Subsection title="16.3 Japan">
                  <p>
                    If you are a consumer in Japan, the Consumer Contract Act
                    (Act No. 61 of 2000) applies to the extent that it cannot be
                    excluded by contract.
                  </p>
                </Subsection>
              </Section>

              <Section
                id="governing-law"
                n={17}
                title="Governing Law and Disputes"
              >
                <Subsection title="17.1 Governing Law">
                  <p>
                    These Terms are governed by the laws of the State of
                    Delaware, United States, without regard to conflict of law
                    provisions. EU/UK consumers retain the protection of
                    mandatory local law.
                  </p>
                </Subsection>

                <Subsection title="17.2 Dispute Resolution">
                  <p>
                    Before initiating legal proceedings, you agree to attempt
                    informal resolution by contacting{" "}
                    <a
                      href="mailto:legal@envpilot.dev"
                      className="text-green-400 hover:underline"
                    >
                      legal@envpilot.dev
                    </a>
                    . If unresolved after 30 days, either party may pursue
                    binding arbitration under the AAA rules, or bring claims in
                    small claims court if eligible.
                  </p>
                </Subsection>

                <Subsection title="17.3 Class Action Waiver">
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs uppercase tracking-wider text-amber-400">
                      TO THE EXTENT PERMITTED BY LAW, YOU AND ENVPILOT EACH
                      WAIVE THE RIGHT TO PARTICIPATE IN A CLASS ACTION,
                      COLLECTIVE ACTION, OR OTHER REPRESENTATIVE PROCEEDING.
                      THIS WAIVER DOES NOT APPLY IF PROHIBITED BY YOUR
                      JURISDICTION&apos;S LAW.
                    </p>
                  </div>
                </Subsection>

                <Subsection title="17.4 EU/UK Consumers">
                  <p>
                    EU consumers may bring proceedings before local courts and
                    use the European Commission&apos;s Online Dispute Resolution
                    platform. UK consumers may bring proceedings in the courts
                    of England and Wales, Scotland, or Northern Ireland.
                  </p>
                </Subsection>
              </Section>

              <Section id="general" n={18} title="General Provisions">
                <Subsection title="18.1 Entire Agreement">
                  <p>
                    These Terms, together with our Privacy Policy, constitute
                    the entire agreement between you and Envpilot regarding the
                    Service.
                  </p>
                </Subsection>

                <Subsection title="18.2 Severability">
                  <p>
                    If any provision is held invalid or unenforceable, it will
                    be enforced to the maximum extent permissible, and the
                    remaining provisions remain in full force.
                  </p>
                </Subsection>

                <Subsection title="18.3 Waiver">
                  <p>
                    Our failure to enforce any right or provision will not
                    constitute a waiver of that right or provision.
                  </p>
                </Subsection>

                <Subsection title="18.4 Assignment">
                  <p>
                    You may not assign these Terms without our written consent.
                    We may assign without restriction.
                  </p>
                </Subsection>

                <Subsection title="18.5 Force Majeure">
                  <p>
                    Neither party is liable for failure or delay due to causes
                    beyond reasonable control, including natural disasters, war,
                    pandemics, governmental actions, power failures, internet
                    failures, or cyberattacks.
                  </p>
                </Subsection>

                <Subsection title="18.6 Changes to These Terms">
                  <p>
                    We may modify these Terms at any time. We will notify you of
                    material changes at least 30 days before they take effect.
                    Continued use after the effective date constitutes
                    acceptance.
                  </p>
                </Subsection>
              </Section>

              <Section id="contact" n={19} title="Contact">
                <p>For questions about these Terms:</p>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-zinc-300">Envpilot Legal</p>
                  <p className="mt-1">
                    Email:{" "}
                    <a
                      href="mailto:legal@envpilot.dev"
                      className="text-green-400 hover:underline"
                    >
                      legal@envpilot.dev
                    </a>
                  </p>
                </div>
              </Section>
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
                </a>
                {" "}&middot;{" "}
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

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}
