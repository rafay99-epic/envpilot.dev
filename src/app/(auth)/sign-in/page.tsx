import { getSignInUrl, withAuth } from '@workos-inc/authkit-nextjs'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function SignInPage() {
  // Check if user is already authenticated
  const { user } = await withAuth()

  if (user) {
    redirect('/dashboard')
  }

  // Get the WorkOS sign-in URL
  const signInUrl = await getSignInUrl()

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md space-y-8">
        {/* Logo/Brand */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            ENV Connect
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Secure environment variable management
          </p>
        </div>

        {/* Sign In Card */}
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Sign in to your account
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Continue with your work email or SSO
          </p>

          <div className="mt-6">
            <a
              href={signInUrl}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              Continue with WorkOS
            </a>
          </div>

          {/* SSO Info */}
          <div className="mt-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Enterprise SSO
            </h3>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Your organization may have single sign-on configured. You&apos;ll be
              automatically redirected to your identity provider.
            </p>
          </div>
        </div>

        {/* Sign Up Link */}
        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/sign-up"
            className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
          >
            Sign up
          </Link>
        </p>

        {/* Back to Home */}
        <p className="text-center text-sm">
          <Link
            href="/"
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
