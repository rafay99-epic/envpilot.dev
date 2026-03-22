"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

const SECTIONS = [
  { id: "introduction", label: "Introduction" },
  { id: "data-controller", label: "Data Controller" },
  { id: "data-we-collect", label: "Data We Collect" },
  { id: "how-we-use-data", label: "How We Use Data" },
  { id: "data-security", label: "Data Security" },
  { id: "legal-bases", label: "Legal Bases (GDPR)" },
  { id: "third-parties", label: "Third-Party Processors" },
  { id: "international-transfers", label: "International Transfers" },
  { id: "cookies", label: "Cookies" },
  { id: "data-retention", label: "Data Retention" },
  { id: "your-rights", label: "Your Rights" },
  { id: "childrens-privacy", label: "Children\u2019s Privacy" },
  { id: "breach-notification", label: "Breach Notification" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPolicyPage() {
  const [activeSection, setActiveSection] = useState("introduction");

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
              Privacy Policy
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
              <Section id="introduction" n={1} title="Introduction">
                <p>
                  Envpilot (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
                  &ldquo;our&rdquo;) operates the Envpilot platform, including
                  the web application, command-line interface (CLI), and Visual
                  Studio Code extension (collectively, the
                  &ldquo;Service&rdquo;). This Privacy Policy explains what
                  personal data we collect, why we collect it, how we process
                  and store it, and your rights regarding that data.
                </p>
                <p className="mt-3">
                  By using the Service, you acknowledge that you have read and
                  understood this Privacy Policy. If you do not agree with our
                  practices, do not use the Service.
                </p>
              </Section>

              <Section id="data-controller" n={2} title="Data Controller">
                <p>
                  Envpilot is the data controller responsible for your personal
                  data processed through the Service. For privacy-related
                  inquiries, contact us at{" "}
                  <a
                    href="mailto:privacy@envpilot.dev"
                    className="text-green-400 hover:underline"
                  >
                    privacy@envpilot.dev
                  </a>
                  .
                </p>
              </Section>

              <Section id="data-we-collect" n={3} title="Data We Collect">
                <Subsection title="3.1 Account Data">
                  <p>
                    When you create an account via our authentication provider
                    (WorkOS AuthKit), we receive and store:
                  </p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Email address
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      First and last name (if provided)
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Profile picture URL (if provided)
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Account creation and last-active timestamps
                    </li>
                  </ul>
                </Subsection>

                <Subsection title="3.2 Organization and Team Data">
                  <p>When you create or join an organization, we store:</p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Organization name, description, and logo
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Membership details (your role: admin, team lead, or
                      member)
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Invitation records (invitee email, assigned role, status,
                      expiration)
                    </li>
                  </ul>
                </Subsection>

                <Subsection title="3.3 Project and Variable Metadata">
                  <p>
                    For projects you create, we store the project name,
                    description, environment labels (e.g., development, staging,
                    production), variable key names, descriptions, sensitivity
                    flags, and version history. Actual secret values are never
                    stored in our primary database&mdash;see Section 5 for
                    encrypted vault storage details.
                  </p>
                </Subsection>

                <Subsection title="3.4 Audit and Security Logs">
                  <p>
                    Every action performed within the Service is logged. Audit
                    log entries include:
                  </p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Action type and timestamp
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      User who performed the action
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      IP address and user-agent string
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Request and session identifiers
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Geographic location derived from IP (country/region only)
                    </li>
                  </ul>
                </Subsection>

                <Subsection title="3.5 Billing Data">
                  <p>
                    If you subscribe to a paid plan, our payment processor
                    (Polar.sh) collects your payment method details. We store
                    subscription identifiers, plan tier, billing period dates,
                    and payment status. We do not store credit card numbers or
                    bank account information on our servers.
                  </p>
                </Subsection>

                <Subsection title="3.6 Device and Token Data (CLI and Extension)">
                  <p>
                    When you authenticate via the CLI or VS Code extension, we
                    collect the device name and a device identifier. Access and
                    refresh tokens are generated and stored on your local
                    machine. We record token creation and last-used timestamps
                    on our servers.
                  </p>
                </Subsection>

                <Subsection title="3.7 Feature Requests">
                  <p>
                    If you submit a feature request through our wishlist, we
                    store the request title, description, category, your email
                    (if provided), and vote data.
                  </p>
                </Subsection>
              </Section>

              <Section id="how-we-use-data" n={4} title="How We Use Your Data">
                <p>We process personal data for the following purposes:</p>
                <ul className="mt-3 space-y-2 pl-4">
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Service delivery:</span>{" "}
                    authenticate your identity, manage your account, deliver
                    environment variable management, enforce role-based access
                    controls.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Security:</span> detect
                    unauthorized access, investigate incidents, maintain audit
                    trails.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Billing:</span> process
                    subscription payments, manage plan tiers, send
                    payment-related communications.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Communications:</span> send
                    team invitations and account-related notifications.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Product improvement:</span>{" "}
                    analyze usage patterns in aggregate and respond to feature
                    requests.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Legal compliance:</span>{" "}
                    fulfill legal obligations, respond to lawful requests,
                    enforce our Terms of Service.
                  </li>
                </ul>
              </Section>

              <Section id="data-security" n={5} title="Data Security">
                <Subsection title="5.1 Secret Value Encryption">
                  <p>
                    Environment variable values are stored exclusively in WorkOS
                    Vault using end-to-end encryption. Each secret is encrypted
                    with a unique data encryption key (DEK) derived from an
                    organization-level key encryption key (KEK), providing
                    cryptographic isolation between organizations. Our primary
                    database stores only vault reference identifiers, never
                    plaintext secret values.
                  </p>
                </Subsection>

                <Subsection title="5.2 Session Security">
                  <p>
                    User sessions are managed through encrypted HTTP-only
                    cookies. CLI and extension sessions use short-lived access
                    tokens with refresh token rotation. All communication
                    between clients and our servers occurs over TLS.
                  </p>
                </Subsection>

                <Subsection title="5.3 Infrastructure">
                  <p>
                    Our backend infrastructure is hosted by Convex (database)
                    and Vercel (application hosting). Both providers maintain
                    SOC 2 compliance and encrypt data at rest and in transit. We
                    regularly review our security posture and follow industry
                    best practices.
                  </p>
                </Subsection>
              </Section>

              <Section
                id="legal-bases"
                n={6}
                title="Legal Bases for Processing (EEA/UK)"
              >
                <p>
                  If you are in the European Economic Area or the United
                  Kingdom, we process your personal data under the following
                  legal bases (GDPR):
                </p>
                <ul className="mt-3 space-y-2 pl-4">
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      Contract (Art. 6(1)(b)):
                    </span>{" "}
                    processing necessary to provide the Service you signed up
                    for, including account management, authentication, secret
                    storage, and billing.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      Legitimate interests (Art. 6(1)(f)):
                    </span>{" "}
                    security logging, fraud prevention, aggregate analytics for
                    product improvement, and maintaining platform integrity.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      Legal obligation (Art. 6(1)(c)):
                    </span>{" "}
                    where required to comply with applicable laws or lawful
                    government requests.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">
                      Consent (Art. 6(1)(a)):
                    </span>{" "}
                    where applicable, such as optional communications. You may
                    withdraw consent at any time.
                  </li>
                </ul>
              </Section>

              <Section id="third-parties" n={7} title="Third-Party Processors">
                <p>
                  We share personal data with the following service providers,
                  each bound by data processing agreements:
                </p>
                <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="px-4 py-3 text-zinc-300">Provider</th>
                        <th className="px-4 py-3 text-zinc-300">Purpose</th>
                        <th className="px-4 py-3 text-zinc-300">Data Shared</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      <tr>
                        <td className="px-4 py-3 text-green-400">WorkOS</td>
                        <td className="px-4 py-3">Auth, encrypted vault</td>
                        <td className="px-4 py-3">
                          Email, name, tokens, encrypted secrets
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-green-400">Convex</td>
                        <td className="px-4 py-3">Real-time database</td>
                        <td className="px-4 py-3">
                          Account metadata, project data, audit logs
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-green-400">Polar.sh</td>
                        <td className="px-4 py-3">Payment processing</td>
                        <td className="px-4 py-3">
                          Email, billing address, payment method
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-green-400">Resend</td>
                        <td className="px-4 py-3">Transactional email</td>
                        <td className="px-4 py-3">
                          Recipient email, invitation details
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-green-400">Vercel</td>
                        <td className="px-4 py-3">Application hosting</td>
                        <td className="px-4 py-3">Server logs, IP addresses</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-4">
                  We do not sell your personal data to any third party. We do
                  not use your data for advertising or profiling.
                </p>
              </Section>

              <Section
                id="international-transfers"
                n={8}
                title="International Data Transfers"
              >
                <p>
                  Your data may be transferred to and processed in the United
                  States and other countries where our providers operate. For
                  transfers from the EEA, UK, or Switzerland, we rely on:
                </p>
                <ul className="mt-3 space-y-1 pl-4">
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    Standard Contractual Clauses (SCCs) approved by the European
                    Commission
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    The EU-U.S. Data Privacy Framework, where applicable
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    Supplementary technical measures including end-to-end
                    encryption
                  </li>
                </ul>
                <p className="mt-3">
                  For Asia-Pacific jurisdictions (Japan, South Korea, Singapore,
                  India), we comply with applicable cross-border transfer
                  requirements, including obtaining necessary consent or relying
                  on contractual safeguards as required by local law.
                </p>
              </Section>

              <Section id="cookies" n={9} title="Cookies and Tracking">
                <p>
                  We use only strictly necessary cookies required for the
                  Service to function:
                </p>
                <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="px-4 py-3 text-zinc-300">Cookie</th>
                        <th className="px-4 py-3 text-zinc-300">Purpose</th>
                        <th className="px-4 py-3 text-zinc-300">Type</th>
                        <th className="px-4 py-3 text-zinc-300">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-4 py-3 text-green-400">
                          wos-session
                        </td>
                        <td className="px-4 py-3">Auth session</td>
                        <td className="px-4 py-3">
                          Strictly necessary, HTTP-only, Secure
                        </td>
                        <td className="px-4 py-3">Session</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-4">
                  We do not use analytics cookies, advertising cookies,
                  marketing trackers, or third-party tracking pixels. Since we
                  only use strictly necessary cookies, no consent banner is
                  required under the ePrivacy Directive. If we introduce
                  non-essential cookies in the future, we will obtain your
                  consent first.
                </p>
              </Section>

              <Section id="data-retention" n={10} title="Data Retention">
                <ul className="space-y-2 pl-4">
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Account data:</span>{" "}
                    retained for account duration. Deleted within 30 days of
                    account deletion request.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Audit logs:</span> retained
                    for 2 years from creation, then purged.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Secret values:</span>{" "}
                    deleted from encrypted vault when you delete a variable or
                    close your account.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Billing records:</span>{" "}
                    retained as required by tax and financial regulations
                    (typically 7 years).
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">CLI/extension tokens:</span>{" "}
                    expire per configured lifetime. Revoked tokens purged within
                    30 days.
                  </li>
                  <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                    <span className="text-zinc-300">Invitation records:</span>{" "}
                    expired/declined invitations retained 90 days, then deleted.
                  </li>
                </ul>
              </Section>

              <Section id="your-rights" n={11} title="Your Rights">
                <Subsection title="11.1 GDPR Rights (EEA/UK)">
                  <p>You have the right to:</p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Access</span> your
                      personal data and obtain a copy
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Rectify</span> inaccurate
                      or incomplete data
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Erase</span> your data
                      (&ldquo;right to be forgotten&rdquo;)
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Restrict</span> processing
                      of your data
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Port</span> your data in a
                      structured, machine-readable format
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Object</span> to
                      processing based on legitimate interests
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Withdraw consent</span> at
                      any time
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Lodge a complaint</span>{" "}
                      with your local data protection authority
                    </li>
                  </ul>
                </Subsection>

                <Subsection title="11.2 U.S. State Privacy Laws">
                  <p>
                    If you reside in California (CCPA/CPRA), Virginia (VCDPA),
                    Colorado (CPA), Connecticut (CTDPA), or other U.S. states
                    with comprehensive privacy laws, you have the right to:
                  </p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Know what personal information we collect and why
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Request deletion of your personal information
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Opt out of sale or sharing (we do not sell or share your
                      data)
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Non-discrimination for exercising your rights
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      Correct inaccurate personal information
                    </li>
                  </ul>
                  <p className="mt-3">
                    We do not sell personal information as defined by the CCPA.
                    We do not use personal information for targeted advertising.
                  </p>
                </Subsection>

                <Subsection title="11.3 Asia-Pacific Privacy Laws">
                  <ul className="mt-2 space-y-2 pl-4">
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Japan (APPI):</span> You
                      may request disclosure, correction, or deletion. We
                      transfer data internationally using contractual
                      safeguards.
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">South Korea (PIPA):</span>{" "}
                      You may access, correct, suspend processing of, or delete
                      your data. We notify you of cross-border transfers.
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">Singapore (PDPA):</span>{" "}
                      You may access and correct your data. We obtain consent as
                      required.
                    </li>
                    <li className="text-zinc-500 before:mr-2 before:text-green-500 before:content-['-']">
                      <span className="text-zinc-300">India (DPDPA):</span> You
                      may access, correct, erase, and port your data. You may
                      nominate another person to exercise rights on your behalf.
                    </li>
                  </ul>
                </Subsection>

                <Subsection title="11.4 How to Exercise Your Rights">
                  <p>
                    Contact us at{" "}
                    <a
                      href="mailto:privacy@envpilot.dev"
                      className="text-green-400 hover:underline"
                    >
                      privacy@envpilot.dev
                    </a>
                    . We will respond within 30 days (or sooner where required).
                    We may need to verify your identity before processing your
                    request.
                  </p>
                </Subsection>
              </Section>

              <Section id="childrens-privacy" n={12} title="Children's Privacy">
                <p>
                  The Service is not directed at individuals under 16 years of
                  age (or the applicable minimum age in your jurisdiction). We
                  do not knowingly collect personal data from children. If you
                  believe a child has provided us with personal data, contact us
                  and we will promptly delete it.
                </p>
              </Section>

              <Section
                id="breach-notification"
                n={13}
                title="Data Breach Notification"
              >
                <p>
                  In the event of a personal data breach likely to result in a
                  risk to your rights and freedoms, we will notify the relevant
                  supervisory authority within 72 hours of becoming aware of the
                  breach (GDPR Article 33). If the breach is likely to result in
                  a high risk to you, we will also notify you directly without
                  undue delay.
                </p>
              </Section>

              <Section id="changes" n={14} title="Changes to This Policy">
                <p>
                  We may update this Privacy Policy from time to time. We will
                  notify you of material changes by posting the updated policy
                  with a revised date. For significant changes, we will provide
                  additional notice (email or in-app banner). Continued use of
                  the Service after changes take effect constitutes acceptance
                  of the revised policy.
                </p>
              </Section>

              <Section id="contact" n={15} title="Contact">
                <p>
                  For questions, concerns, or requests related to this Privacy
                  Policy or your personal data:
                </p>
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-zinc-300">Envpilot Privacy Team</p>
                  <p className="mt-1">
                    Email:{" "}
                    <a
                      href="mailto:privacy@envpilot.dev"
                      className="text-green-400 hover:underline"
                    >
                      privacy@envpilot.dev
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
