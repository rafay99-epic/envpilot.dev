import type { Metadata } from "next";
import {
  MarketingShell,
  PageHero,
  GlowDivider,
  Reveal,
} from "@/components/marketing";
import { ScrollSpySidebar } from "@/components/ui/ScrollSpySidebar";

export const metadata: Metadata = {
  title: "Privacy Policy | Envpilot",
  description:
    "Learn how Envpilot collects, uses, and protects your personal data. AES-256 encryption, GDPR compliance, and zero-knowledge architecture.",
  alternates: { canonical: "/privacy" },
};

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
  { id: "childrens-privacy", label: "Children’s Privacy" },
  { id: "breach-notification", label: "Breach Notification" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <MarketingShell>
      <PageHero eyebrow="privacy" title="Privacy Policy" align="left">
        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 font-mono text-xs text-zinc-400">
          <span className="text-green-500">&#10095;</span>
          Effective: March 10, 2026 &middot; Last updated: March 10, 2026
        </span>
      </PageHero>

      <GlowDivider />

      {/* Content with sidebar */}
      <section className="relative py-12 pb-24">
        <div className="mx-auto grid max-w-5xl gap-12 px-4 sm:px-6 lg:grid-cols-[14rem_1fr]">
          {/* Sidebar TOC — client island for scroll-spy */}
          <ScrollSpySidebar sections={SECTIONS} />

          {/* Main content — fully server-rendered */}
          <div className="min-w-0 font-mono text-sm leading-relaxed text-zinc-400">
            <Section id="introduction" n={1} title="Introduction">
              <p>
                Envpilot (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
                &ldquo;our&rdquo;) operates the Envpilot platform, including the
                web application, command-line interface (CLI), and Visual Studio
                Code extension (collectively, the &ldquo;Service&rdquo;). This
                Privacy Policy explains what personal data we collect, why we
                collect it, how we process and store it, and your rights
                regarding that data.
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
                  <Li>Email address</Li>
                  <Li>First and last name (if provided)</Li>
                  <Li>Profile picture URL (if provided)</Li>
                  <Li>Account creation and last-active timestamps</Li>
                </ul>
              </Subsection>

              <Subsection title="3.2 Organization and Team Data">
                <p>When you create or join an organization, we store:</p>
                <ul className="mt-2 space-y-1 pl-4">
                  <Li>Organization name, description, and logo</Li>
                  <Li>
                    Membership details (your role: owner, project manager, team
                    lead, or developer)
                  </Li>
                  <Li>
                    Invitation records (invitee email, assigned role, status,
                    expiration)
                  </Li>
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
                  Every action performed within the Service is logged. Audit log
                  entries include:
                </p>
                <ul className="mt-2 space-y-1 pl-4">
                  <Li>Action type and timestamp</Li>
                  <Li>User who performed the action</Li>
                  <Li>IP address and user-agent string</Li>
                  <Li>Request and session identifiers</Li>
                  <Li>
                    Geographic location derived from IP (country/region only)
                  </Li>
                </ul>
              </Subsection>

              <Subsection title="3.5 Billing Data">
                <p>
                  If you subscribe to a paid plan, our payment processor
                  (Polar.sh) collects your payment method details. We store
                  subscription identifiers, plan tier, billing period dates, and
                  payment status. We do not store credit card numbers or bank
                  account information on our servers. If you cancel a
                  subscription, the cancellation reason and any optional
                  feedback you provide are recorded with the subscription at our
                  payment processor and used solely to improve the Service.
                </p>
              </Subsection>

              <Subsection title="3.6 Device and Token Data (CLI and Extension)">
                <p>
                  When you authenticate via the CLI or VS Code extension, we
                  collect the device name and a device identifier. Access and
                  refresh tokens are generated and stored on your local machine.
                  We record token creation and last-used timestamps on our
                  servers.
                </p>
              </Subsection>

              <Subsection title="3.7 Feature Requests">
                <p>
                  If you submit a feature request through our wishlist, we store
                  the request title, description, category, your email (if
                  provided), and vote data.
                </p>
              </Subsection>
            </Section>

            <Section id="how-we-use-data" n={4} title="How We Use Your Data">
              <p>We process personal data for the following purposes:</p>
              <ul className="mt-3 space-y-2 pl-4">
                <Li>
                  <Term>Service delivery:</Term> authenticate your identity,
                  manage your account, deliver environment variable management,
                  enforce role-based access controls.
                </Li>
                <Li>
                  <Term>Security:</Term> detect unauthorized access, investigate
                  incidents, maintain audit trails.
                </Li>
                <Li>
                  <Term>Billing:</Term> process subscription payments, manage
                  plan tiers, send payment-related communications.
                </Li>
                <Li>
                  <Term>Communications:</Term> send team invitations and
                  account-related notifications.
                </Li>
                <Li>
                  <Term>Product improvement:</Term> analyze usage patterns in
                  aggregate and respond to feature requests.
                </Li>
                <Li>
                  <Term>Legal compliance:</Term> fulfill legal obligations,
                  respond to lawful requests, enforce our Terms of Service.
                </Li>
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
                  User sessions are managed through encrypted HTTP-only cookies.
                  CLI and extension sessions use short-lived access tokens with
                  refresh token rotation. All communication between clients and
                  our servers occurs over TLS.
                </p>
              </Subsection>

              <Subsection title="5.3 Infrastructure">
                <p>
                  Our backend infrastructure is hosted by Convex (database) and
                  Vercel (application hosting). Both providers maintain SOC 2
                  compliance and encrypt data at rest and in transit. We
                  regularly review our security posture and follow industry best
                  practices.
                </p>
              </Subsection>
            </Section>

            <Section
              id="legal-bases"
              n={6}
              title="Legal Bases for Processing (EEA/UK)"
            >
              <p>
                If you are in the European Economic Area or the United Kingdom,
                we process your personal data under the following legal bases
                (GDPR):
              </p>
              <ul className="mt-3 space-y-2 pl-4">
                <Li>
                  <Term>Contract (Art. 6(1)(b)):</Term> processing necessary to
                  provide the Service you signed up for, including account
                  management, authentication, secret storage, and billing.
                </Li>
                <Li>
                  <Term>Legitimate interests (Art. 6(1)(f)):</Term> security
                  logging, fraud prevention, aggregate analytics for product
                  improvement, and maintaining platform integrity.
                </Li>
                <Li>
                  <Term>Legal obligation (Art. 6(1)(c)):</Term> where required
                  to comply with applicable laws or lawful government requests.
                </Li>
                <Li>
                  <Term>Consent (Art. 6(1)(a)):</Term> where applicable, such as
                  optional communications. You may withdraw consent at any time.
                </Li>
              </ul>
            </Section>

            <Section id="third-parties" n={7} title="Third-Party Processors">
              <p>
                We share personal data with the following service providers,
                each bound by data processing agreements:
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/30">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Provider
                      </th>
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Purpose
                      </th>
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Data Shared
                      </th>
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
                We do not sell your personal data to any third party. We do not
                use your data for advertising or profiling.
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
                <Li>
                  Standard Contractual Clauses (SCCs) approved by the European
                  Commission
                </Li>
                <Li>The EU-U.S. Data Privacy Framework, where applicable</Li>
                <Li>
                  Supplementary technical measures including end-to-end
                  encryption
                </Li>
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
                We use only strictly necessary cookies required for the Service
                to function:
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/30">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/50">
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Cookie
                      </th>
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Purpose
                      </th>
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Type
                      </th>
                      <th className="px-4 py-3 font-sans font-semibold text-zinc-200">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-3 text-green-400">wos-session</td>
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
                We do not use analytics cookies, advertising cookies, marketing
                trackers, or third-party tracking pixels. Since we only use
                strictly necessary cookies, no consent banner is required under
                the ePrivacy Directive. If we introduce non-essential cookies in
                the future, we will obtain your consent first.
              </p>
            </Section>

            <Section id="data-retention" n={10} title="Data Retention">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                <ul className="space-y-2 pl-4">
                  <Li>
                    <Term>Account data:</Term> retained for account duration.
                    Deleted within 30 days of account deletion request.
                  </Li>
                  <Li>
                    <Term>Audit logs:</Term> retained for 2 years from creation,
                    then purged.
                  </Li>
                  <Li>
                    <Term>Secret values:</Term> deleted from encrypted vault
                    when you delete a variable or close your account.
                  </Li>
                  <Li>
                    <Term>Billing records:</Term> retained as required by tax
                    and financial regulations (typically 7 years).
                  </Li>
                  <Li>
                    <Term>CLI/extension tokens:</Term> expire per configured
                    lifetime. Revoked tokens purged within 30 days.
                  </Li>
                  <Li>
                    <Term>Invitation records:</Term> expired/declined
                    invitations retained 90 days, then deleted.
                  </Li>
                </ul>
              </div>
            </Section>

            <Section id="your-rights" n={11} title="Your Rights">
              <Subsection title="11.1 GDPR Rights (EEA/UK)">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                  <p>You have the right to:</p>
                  <ul className="mt-2 space-y-1 pl-4">
                    <Li>
                      <Term>Access</Term> your personal data and obtain a copy
                    </Li>
                    <Li>
                      <Term>Rectify</Term> inaccurate or incomplete data
                    </Li>
                    <Li>
                      <Term>Erase</Term> your data (&ldquo;right to be
                      forgotten&rdquo;)
                    </Li>
                    <Li>
                      <Term>Restrict</Term> processing of your data
                    </Li>
                    <Li>
                      <Term>Port</Term> your data in a structured,
                      machine-readable format
                    </Li>
                    <Li>
                      <Term>Object</Term> to processing based on legitimate
                      interests
                    </Li>
                    <Li>
                      <Term>Withdraw consent</Term> at any time
                    </Li>
                    <Li>
                      <Term>Lodge a complaint</Term> with your local data
                      protection authority
                    </Li>
                  </ul>
                </div>
              </Subsection>

              <Subsection title="11.2 U.S. State Privacy Laws">
                <p>
                  If you reside in California (CCPA/CPRA), Virginia (VCDPA),
                  Colorado (CPA), Connecticut (CTDPA), or other U.S. states with
                  comprehensive privacy laws, you have the right to:
                </p>
                <ul className="mt-2 space-y-1 pl-4">
                  <Li>Know what personal information we collect and why</Li>
                  <Li>Request deletion of your personal information</Li>
                  <Li>
                    Opt out of sale or sharing (we do not sell or share your
                    data)
                  </Li>
                  <Li>Non-discrimination for exercising your rights</Li>
                  <Li>Correct inaccurate personal information</Li>
                </ul>
                <p className="mt-3">
                  We do not sell personal information as defined by the CCPA. We
                  do not use personal information for targeted advertising.
                </p>
              </Subsection>

              <Subsection title="11.3 Asia-Pacific Privacy Laws">
                <ul className="mt-2 space-y-2 pl-4">
                  <Li>
                    <Term>Japan (APPI):</Term> You may request disclosure,
                    correction, or deletion. We transfer data internationally
                    using contractual safeguards.
                  </Li>
                  <Li>
                    <Term>South Korea (PIPA):</Term> You may access, correct,
                    suspend processing of, or delete your data. We notify you of
                    cross-border transfers.
                  </Li>
                  <Li>
                    <Term>Singapore (PDPA):</Term> You may access and correct
                    your data. We obtain consent as required.
                  </Li>
                  <Li>
                    <Term>India (DPDPA):</Term> You may access, correct, erase,
                    and port your data. You may nominate another person to
                    exercise rights on your behalf.
                  </Li>
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
                The Service is not directed at individuals under 16 years of age
                (or the applicable minimum age in your jurisdiction). We do not
                knowingly collect personal data from children. If you believe a
                child has provided us with personal data, contact us and we will
                promptly delete it.
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
                breach (GDPR Article 33). If the breach is likely to result in a
                high risk to you, we will also notify you directly without undue
                delay.
              </p>
            </Section>

            <Section id="changes" n={14} title="Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. We will
                notify you of material changes by posting the updated policy
                with a revised date. For significant changes, we will provide
                additional notice (email or in-app banner). Continued use of the
                Service after changes take effect constitutes acceptance of the
                revised policy.
              </p>
            </Section>

            <Section id="contact" n={15} title="Contact">
              <p>
                For questions, concerns, or requests related to this Privacy
                Policy or your personal data:
              </p>
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                <p className="flex items-center gap-2 text-zinc-200">
                  <span className="text-green-500">&#10095;</span>
                  <strong className="font-semibold">
                    Envpilot Privacy Team
                  </strong>
                </p>
                <p className="mt-2">
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
      className="scroll-mt-24 border-b border-zinc-800/60 py-10 first:pt-0 last:border-b-0"
    >
      <Reveal>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs tracking-widest text-green-500">
            &sect; {String(n).padStart(2, "0")}
          </span>
          <h2 className="font-sans text-xl font-semibold tracking-tight text-zinc-100">
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
      <h3 className="font-sans text-sm font-semibold text-zinc-200">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** List item with a green caret marker. */
function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-zinc-400 before:mr-2 before:text-green-500 before:content-['\276F']">
      {children}
    </li>
  );
}

/** Emphasized key term inside legal prose. */
function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-zinc-200">{children}</strong>;
}
