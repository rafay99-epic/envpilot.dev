'use client'

import { useState, useEffect, use, useCallback, useRef } from 'react'
import Link from 'next/link'

interface Member {
  _id: string
  userId: string
  role: 'admin' | 'team_lead' | 'member'
  joinedAt: number
  user: {
    _id: string
    email: string
    name?: string
    avatarUrl?: string
  }
}

interface Invitation {
  _id: string
  email: string
  role: 'admin' | 'team_lead' | 'member'
  expiresAt: number
  createdAt: number
  invitedByUser?: {
    name?: string
    email: string
  }
}

interface Organization {
  _id: string
  name: string
  role: 'admin' | 'team_lead' | 'member'
}

interface SearchUser {
  _id: string
  email: string
  name?: string
  avatarUrl?: string
  isMember?: boolean
  hasPendingInvitation?: boolean
}

export default function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'team_lead' | 'member'>('member')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchData()
  }, [id])

  async function fetchData() {
    try {
      const [orgRes, membersRes] = await Promise.all([
        fetch(`/api/organizations/${id}`),
        fetch(`/api/organizations/${id}/members`),
      ])

      if (!orgRes.ok) {
        throw new Error('Failed to fetch organization')
      }

      const orgData = await orgRes.json()
      setOrganization(orgData.organization)

      if (membersRes.ok) {
        const membersData = await membersRes.json()
        setMembers(membersData.members || [])
        setInvitations(membersData.invitations || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setIsInviting(true)
    setInviteError(null)

    try {
      const response = await fetch(`/api/organizations/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send invitation')
      }

      setShowInviteModal(false)
      setInviteEmail('')
      setInviteRole('member')
      fetchData()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsInviting(false)
    }
  }

  async function handleRoleChange(userId: string, newRole: 'admin' | 'team_lead' | 'member') {
    try {
      const response = await fetch(`/api/organizations/${id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update role')
      }

      setMembers(members.map(m =>
        m.user._id === userId ? { ...m, role: newRole } : m
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Are you sure you want to remove this member?')) return

    try {
      const response = await fetch(`/api/organizations/${id}/members?userId=${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove member')
      }

      setMembers(members.filter(m => m.user._id !== userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const searchUsers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      setShowSearchResults(false)
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&organizationId=${id}&limit=5`)
      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.users || [])
        setShowSearchResults(true)
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setIsSearching(false)
    }
  }, [id])

  function handleEmailChange(value: string) {
    setInviteEmail(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchUsers(value)
    }, 300)
  }

  function selectUser(user: SearchUser) {
    setInviteEmail(user.email)
    setShowSearchResults(false)
    setSearchResults([])
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!confirm('Are you sure you want to cancel this invitation?')) return

    try {
      const response = await fetch(`/api/organizations/${id}/invitations/${invitationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to cancel invitation')
      }

      setInvitations(invitations.filter(inv => inv._id !== invitationId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  async function handleResendInvitation(invitationId: string) {
    try {
      const response = await fetch(`/api/organizations/${id}/invitations/${invitationId}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to resend invitation')
      }

      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const canInvite = organization?.role === 'admin' || organization?.role === 'team_lead'
  const isAdmin = organization?.role === 'admin'

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="animate-pulse space-y-6">
          <div className="h-7 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error && !organization) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/organizations/${id}`}
            className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to {organization?.name}
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Team Members
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manage who has access to {organization?.name}.
          </p>
        </div>
        {canInvite && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Invite Member
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Members List */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Members ({members.length})
          </h2>
        </div>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {members.map((member) => (
            <li key={member._id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-4">
                {member.user.avatarUrl ? (
                  <img
                    src={member.user.avatarUrl}
                    alt={member.user.name || member.user.email}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                      {(member.user.name || member.user.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {member.user.name || 'Unnamed User'}
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {member.user.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {isAdmin ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.user._id, e.target.value as 'admin' | 'team_lead' | 'member')}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="admin">Admin</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      member.role === 'admin'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        : member.role === 'team_lead'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {member.role === 'team_lead' ? 'Team Lead' : member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleRemoveMember(member.user._id)}
                    className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {invitations.map((invitation) => (
              <li key={invitation._id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                    <svg
                      className="h-5 w-5 text-amber-600 dark:text-amber-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {invitation.email}
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Invited {new Date(invitation.createdAt).toLocaleDateString()} · Expires{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      invitation.role === 'admin'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        : invitation.role === 'team_lead'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {invitation.role === 'team_lead' ? 'Team Lead' : invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                  </span>
                  {canInvite && (
                    <>
                      <button
                        onClick={() => handleResendInvitation(invitation._id)}
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                        title="Resend invitation"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleCancelInvitation(invitation._id)}
                        className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        title="Cancel invitation"
                      >
                        <svg
                          className="h-4 w-4"
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
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Invite Team Member
            </h3>
            <form onSubmit={handleInvite} className="mt-4 space-y-4">
              {inviteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                  <p className="text-sm text-red-600 dark:text-red-400">{inviteError}</p>
                </div>
              )}
              <div className="relative">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  Email Address
                </label>
                <div className="relative mt-2">
                  <input
                    ref={searchInputRef}
                    type="email"
                    id="email"
                    value={inviteEmail}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onFocus={() => inviteEmail.length >= 2 && setShowSearchResults(true)}
                    onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                    placeholder="Search by email or name..."
                    required
                    autoComplete="off"
                    className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  {isSearching && (
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-400" />
                    </div>
                  )}
                </div>
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                    <ul className="max-h-60 overflow-auto py-1">
                      {searchResults.map((user) => (
                        <li key={user._id}>
                          <button
                            type="button"
                            onClick={() => selectUser(user)}
                            disabled={user.isMember || user.hasPendingInvitation}
                            className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-700"
                          >
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.name || user.email}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-700">
                                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                                  {(user.name || user.email).charAt(0).toUpperCase()}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {user.name || 'Unnamed User'}
                              </p>
                              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                {user.email}
                              </p>
                            </div>
                            {user.isMember && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Member
                              </span>
                            )}
                            {user.hasPendingInvitation && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                Pending
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                <label
                  htmlFor="role"
                  className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  Role
                </label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'team_lead' | 'member')}
                  className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {isAdmin && <option value="admin">Admin</option>}
                  <option value="team_lead">Team Lead</option>
                  <option value="member">Member</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false)
                    setInviteEmail('')
                    setInviteRole('member')
                    setInviteError(null)
                    setSearchResults([])
                    setShowSearchResults(false)
                  }}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInviting || !inviteEmail}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {isInviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
