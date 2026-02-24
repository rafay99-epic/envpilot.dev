import Link from 'next/link'
import { withAuth } from '@workos-inc/authkit-nextjs'
import {
  HeroSceneWrapper,
  FeatureShowcaseWrapper,
  WorkflowVisualizationWrapper,
  UseCasesSectionWrapper,
} from '@/components/landing/LandingPageClient'

export default async function HomePage() {
  const { user } = await withAuth()

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100">
              <svg className="h-4 w-4 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              ENV Connect
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link href="#showcase" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Features
            </Link>
            <Link href="#workflow" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              How It Works
            </Link>
            <Link href="#use-cases" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Use Cases
            </Link>
            <Link href="/wishlist" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Wishlist
            </Link>
            <Link href="/changelog" className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Changelog
            </Link>
          </nav>

          <nav className="flex items-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section with 3D Background */}
      <main className="flex-1 pt-16">
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
          <HeroSceneWrapper />

          <div className="container relative z-10 mx-auto px-4 py-24 text-center md:px-6 lg:py-32">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
              </span>
              Now with Enterprise SSO Support
            </div>

            <h1 className="mx-auto mt-8 max-w-4xl text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl md:text-6xl lg:text-7xl">
              Secure Environment Variables for{' '}
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-cyan-400">
                Modern Teams
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400 md:text-xl">
              Stop sharing secrets over Slack. ENV Connect provides encrypted storage,
              role-based access control, and seamless integrations for your environment
              variables.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/sign-up"
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-8 text-sm font-medium text-white transition-all hover:bg-zinc-800 hover:shadow-lg hover:shadow-zinc-900/25 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:hover:shadow-zinc-100/25 sm:w-auto"
              >
                Start Free Trial
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="#showcase"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white/80 px-8 text-sm font-medium text-zinc-900 backdrop-blur-sm transition-all hover:bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:hover:border-zinc-600 sm:w-auto"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Watch Demo
              </Link>
            </div>

            <div className="mt-16 flex flex-wrap items-center justify-center gap-8 opacity-60">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
                Trusted by teams at
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8">
                {['Vercel', 'Stripe', 'Linear', 'Notion', 'Figma'].map((company) => (
                  <span key={company} className="text-sm font-semibold text-zinc-400 dark:text-zinc-600">
                    {company}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent dark:from-zinc-950" />
        </section>

        {/* Interactive Feature Showcase with 3D */}
        <div id="showcase">
          <FeatureShowcaseWrapper />
        </div>

        {/* Original Features Grid */}
        <section id="features" className="border-t border-zinc-200 bg-zinc-50 py-24 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="container mx-auto px-4 md:px-6">
            <h2 className="text-center text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
              Everything you need for secure secrets management
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-600 dark:text-zinc-400">
              From encrypted storage to real-time syncing, we&apos;ve got you covered.
            </p>

            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                title="End-to-End Encryption"
                description="All secrets are encrypted at rest using WorkOS Vault. Your data is secure even from us."
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
              />
              <FeatureCard
                title="SSO & Multi-Org"
                description="Enterprise-ready authentication with support for SAML, OIDC, and multi-organization workspaces."
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
              />
              <FeatureCard
                title="Role-Based Access"
                description="Granular permissions let you control exactly who can view, edit, or manage each secret."
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
              />
              <FeatureCard
                title="IDE Extensions"
                description="VS Code and Cursor extensions sync your variables directly to your local .env files."
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                }
              />
              <FeatureCard
                title="CLI Tool"
                description="Pull, push, and manage variables from your terminal. Perfect for CI/CD pipelines."
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
              />
              <FeatureCard
                title="Audit Logging"
                description="Complete audit trail of who accessed what and when. Stay compliant with ease."
                icon={
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                }
              />
            </div>
          </div>
        </section>

        {/* Workflow Visualization with 3D */}
        <div id="workflow">
          <WorkflowVisualizationWrapper />
        </div>

        {/* Use Cases Section with 3D */}
        <div id="use-cases">
          <UseCasesSectionWrapper />
        </div>

        {/* Stats Section */}
        <section className="border-t border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard number="10M+" label="Secrets Managed" />
              <StatCard number="5,000+" label="Teams Using" />
              <StatCard number="99.99%" label="Uptime SLA" />
              <StatCard number="SOC2" label="Compliant" />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24">
          <div className="container mx-auto px-4 text-center md:px-6">
            <div className="mx-auto max-w-2xl rounded-3xl border border-zinc-200 bg-gradient-to-b from-zinc-50 to-white p-12 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
              <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
                Ready to secure your secrets?
              </h2>
              <p className="mt-4 text-zinc-600 dark:text-zinc-400">
                Get started for free. No credit card required.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-8 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto"
                >
                  Start Your Free Trial
                </Link>
                <Link
                  href="/sign-in"
                  className="flex h-12 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-8 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
                >
                  Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-12 dark:border-zinc-800">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-zinc-100">
                  <svg className="h-4 w-4 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  ENV Connect
                </span>
              </Link>
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                Secure environment variable management for modern development teams.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Product</h3>
              <ul className="mt-4 space-y-2">
                <li><Link href="#features" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Features</Link></li>
                <li><Link href="#workflow" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">How It Works</Link></li>
                <li><Link href="#use-cases" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Use Cases</Link></li>
                <li><Link href="/wishlist" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Wishlist</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resources</h3>
              <ul className="mt-4 space-y-2">
                <li><Link href="/docs" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Documentation</Link></li>
                <li><Link href="/api" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">API Reference</Link></li>
                <li><Link href="/changelog" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Changelog</Link></li>
                <li><Link href="/status" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Status</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Company</h3>
              <ul className="mt-4 space-y-2">
                <li><Link href="/about" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">About</Link></li>
                <li><Link href="/blog" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Blog</Link></li>
                <li><Link href="/careers" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Careers</Link></li>
                <li><Link href="/contact" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-zinc-200 pt-8 dark:border-zinc-800 sm:flex-row">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              &copy; {new Date().getFullYear()} ENV Connect. All rights reserved.
            </p>
            <div className="flex gap-4">
              <Link href="/privacy" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Privacy Policy</Link>
              <Link href="/terms" className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Terms of Service</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-blue-100 group-hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </div>
  )
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-4xl">
        {number}
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
    </div>
  )
}
