'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface InvitationDetails {
  email: string
  role: 'admin' | 'team_lead' | 'member'
  organization: {
    name: string
    slug: string
    logoUrl?: string
  }
  invitedBy: {
    name?: string
    email: string
  }
  expiresAt: number
}

export default function InvitationAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const router = useRouter()
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'pending' | 'accepted' | 'declined' | 'expired' | 'error'>('pending')

  useEffect(() => {
    async function fetchInvitation() {
      try {
        const response = await fetch(`/api/invitations/${token}`)

        if (!response.ok) {
          const data = await response.json()
          if (data.status === 'expired') {
            setStatus('expired')
          } else if (data.status) {
            setStatus(data.status)
          } else {
            setStatus('error')
          }
          throw new Error(data.error || 'Invitation not found')
        }

        const data = await response.json()
        setInvitation(data.invitation)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchInvitation()
  }, [token])

  async function handleAccept() {
    setIsAccepting(true)
    setError(null)

    try {
      const response = await fetch(`/api/invitations/${token}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to accept invitation')
      }

      const data = await response.json()
      setStatus('accepted')

      // Redirect to the organization after a brief delay
      setTimeout(() => {
        router.push(`/organizations/${data.organization._id}`)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsAccepting(false)
    }
  }

  async function handleDecline() {
    setIsDeclining(true)
    setError(null)

    try {
      const response = await fetch(`/api/invitations/${token}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to decline invitation')
      }

      setStatus('declined')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsDeclining(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-400" />
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">Loading invitation...</p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <svg
              className="h-8 w-8 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Invitation Expired
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            This invitation has expired. Please contact the organization admin to request a new invitation.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (status === 'accepted') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <svg
              className="h-8 w-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Welcome to {invitation?.organization.name}!
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            You have successfully joined the organization. Redirecting you to the organization page...
          </p>
        </div>
      </div>
    )
  }

  if (status === 'declined') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <svg
              className="h-8 w-8 text-zinc-600 dark:text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Invitation Declined
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            You have declined the invitation to join {invitation?.organization.name}.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!invitation) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              className="h-8 w-8 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Invalid Invitation
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            {error || 'This invitation link is invalid or has already been used.'}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          {invitation.organization.logoUrl ? (
            <img
              src={invitation.organization.logoUrl}
              alt={invitation.organization.name}
              className="mx-auto h-16 w-16 rounded-xl object-cover"
            />
          ) : (
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
              <span className="text-2xl font-semibold text-zinc-600 dark:text-zinc-400">
                {invitation.organization.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <h1 className="mt-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Join {invitation.organization.name}
          </h1>

          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">{invitation.invitedBy.name || invitation.invitedBy.email}</span>{' '}
            invited you to join as a{' '}
            <span className="font-medium">
              {invitation.role === 'team_lead' ? 'Team Lead' : invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </span>
          </p>

          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            This invitation was sent to{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{invitation.email}</span>
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="mt-8 flex gap-3">
            <button
              onClick={handleDecline}
              disabled={isDeclining || isAccepting}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isDeclining ? 'Declining...' : 'Decline'}
            </button>
            <button
              onClick={handleAccept}
              disabled={isAccepting || isDeclining}
              className="flex-1 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isAccepting ? 'Accepting...' : 'Accept Invitation'}
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Expires {new Date(invitation.expiresAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
