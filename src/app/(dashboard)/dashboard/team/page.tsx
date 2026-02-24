'use client'

import { useState } from 'react'
import { useAuthContext } from '@/components/auth'
import { PERMISSIONS, ROLES } from '@/lib/auth'

// Mock team members data - would come from Convex in production
const mockTeamMembers = [
  {
    id: '1',
    name: 'You',
    email: 'current@user.com',
    role: 'admin',
    avatarUrl: null,
    joinedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    isCurrentUser: true,
  },
]

export default function TeamPage() {
  const { hasPermission } = useAuthContext()
  const canInvite = hasPermission(PERMISSIONS.TEAM_INVITE)
  const canManageRoles = hasPermission(PERMISSIONS.TEAM_MANAGE_ROLES)

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [teamMembers] = useState(mockTeamMembers)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Team
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Manage team members and their access permissions
          </p>
        </div>
        {canInvite && (
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite Member
          </button>
        )}
      </div>

      {/* Team Members List */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Members ({teamMembers.length})
          </h2>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {teamMembers.map((member) => (
            <TeamMemberRow
              key={member.id}
              member={member}
              canManageRoles={canManageRoles && !member.isCurrentUser}
            />
          ))}
        </div>
      </div>

      {/* Pending Invitations */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Pending Invitations (0)
          </h2>
        </div>
        <div className="p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            No pending invitations
          </p>
        </div>
      </div>

      {/* Role Descriptions */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Role Permissions
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Object.entries(ROLES).map(([key, role]) => (
            <div key={key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {role.name}
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {role.description}
              </p>
              <ul className="mt-2 space-y-1">
                {role.permissions.slice(0, 4).map((permission) => (
                  <li key={permission} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {permission.replace(':', ' ')}
                  </li>
                ))}
                {role.permissions.length > 4 && (
                  <li className="text-xs text-zinc-400">
                    +{role.permissions.length - 4} more
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Granular Access Control Info */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Granular Access Control
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Control who can access specific environment variables in your projects.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  Admin
                </span>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Full access to all variables. Can grant/revoke any permission level (read, write, admin) to any team member.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Team Lead
                </span>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Full access to all variables. Can grant/revoke read or write permissions to Members only.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  Member
                </span>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Access only variables they have been explicitly granted permission to. Permission levels: read (view only), write (can modify), admin (can manage access).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <InviteModal onClose={() => setIsInviteModalOpen(false)} />
      )}
    </div>
  )
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  joinedAt: number
  isCurrentUser: boolean
}

function TeamMemberRow({ member, canManageRoles }: { member: TeamMember; canManageRoles: boolean }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          {member.avatarUrl ? (
            <img src={member.avatarUrl} alt={member.name} className="h-10 w-10 rounded-full" />
          ) : (
            member.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {member.name}
            </p>
            {member.isCurrentUser && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                You
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{member.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {member.role.replace('_', ' ')}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Joined {new Date(member.joinedAt).toLocaleDateString()}
        </span>
        {canManageRoles && (
          <button className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Invite Team Member
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
            >
              <option value="member">Member</option>
              <option value="team_lead">Team Lead</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Send Invitation
          </button>
        </div>
      </div>
    </div>
  )
}
