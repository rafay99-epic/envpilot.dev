'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

interface VariablePermissionsModalProps {
  variableId: Id<'environmentVariables'>
  variableKey: string
  currentUserId: Id<'users'>
  onClose: () => void
}

type PermissionLevel = 'read' | 'write' | 'admin'

export function VariablePermissionsModal({
  variableId,
  variableKey,
  currentUserId,
  onClose,
}: VariablePermissionsModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<Id<'users'> | ''>('')
  const [selectedPermission, setSelectedPermission] = useState<PermissionLevel>('read')
  const [isGranting, setIsGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if current user can manage permissions
  const canManageCheck = useQuery(api.permissions.canManageVariablePermissions, {
    variableId,
    userId: currentUserId,
  })

  // Get current permissions for this variable
  const permissions = useQuery(api.permissions.getForVariable, { variableId })

  // Get assignable members
  const assignableMembers = useQuery(api.permissions.getAssignableMembers, {
    variableId,
    requestingUserId: currentUserId,
  })

  // Mutations
  const grantPermission = useMutation(api.permissions.grant)
  const revokePermission = useMutation(api.permissions.revoke)
  const updatePermission = useMutation(api.permissions.update)

  const handleGrantPermission = async () => {
    if (!selectedUserId) {
      setError('Please select a team member')
      return
    }

    setIsGranting(true)
    setError(null)

    try {
      await grantPermission({
        variableId,
        userId: selectedUserId as Id<'users'>,
        permission: selectedPermission,
        grantedBy: currentUserId,
      })
      setSelectedUserId('')
      setSelectedPermission('read')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant permission')
    } finally {
      setIsGranting(false)
    }
  }

  const handleRevokePermission = async (userId: Id<'users'>) => {
    try {
      await revokePermission({
        variableId,
        userId,
        revokedBy: currentUserId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke permission')
    }
  }

  const handleUpdatePermission = async (permissionId: Id<'variablePermissions'>, newLevel: PermissionLevel) => {
    try {
      await updatePermission({
        permissionId,
        permission: newLevel,
        updatedBy: currentUserId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission')
    }
  }

  // Show loading state while checking permissions
  if (canManageCheck === undefined) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
          <div className="flex items-center justify-center gap-3">
            <svg className="h-5 w-5 animate-spin text-zinc-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading permissions...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!canManageCheck.canManage) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {canManageCheck.reason ?? 'You do not have permission to manage access for this variable.'}
          </p>
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const activePermissions = permissions?.filter((p) => p.isActive) ?? []
  const allowedPermissions = canManageCheck.allowedPermissions ?? ['read', 'write', 'admin']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Manage Access
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Variable: <code className="font-mono">{variableKey}</code>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Grant new permission */}
          <div className="mb-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Grant Access
            </h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value as Id<'users'> | '')}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">Select team member...</option>
                {assignableMembers?.filter(Boolean).map((member) => (
                  <option key={member!._id} value={member!._id}>
                    {member!.name ?? member!.email} ({member!.role})
                  </option>
                ))}
              </select>
              <select
                value={selectedPermission}
                onChange={(e) => setSelectedPermission(e.target.value as PermissionLevel)}
                className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                {allowedPermissions.includes('read') && <option value="read">Read</option>}
                {allowedPermissions.includes('write') && <option value="write">Write</option>}
                {allowedPermissions.includes('admin') && <option value="admin">Admin</option>}
              </select>
              <button
                onClick={handleGrantPermission}
                disabled={isGranting || !selectedUserId}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isGranting ? 'Granting...' : 'Grant'}
              </button>
            </div>
            {assignableMembers?.length === 0 && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                No team members available to grant access to.
              </p>
            )}
          </div>

          {/* Current permissions */}
          <div>
            <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Current Access ({activePermissions.length})
            </h3>
            {activePermissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                <svg
                  className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  No one has been granted access yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
                {activePermissions.map((perm) => (
                  <PermissionRow
                    key={perm._id}
                    permission={perm}
                    allowedPermissions={allowedPermissions}
                    onUpdate={handleUpdatePermission}
                    onRevoke={handleRevokePermission}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {canManageCheck.role === 'team_lead'
                ? 'As a Team Lead, you can grant read/write access to members.'
                : 'As an Admin, you have full control over variable access.'}
            </p>
            <button
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface PermissionRowProps {
  permission: {
    _id: Id<'variablePermissions'>
    userId: Id<'users'>
    permission: string
    grantedAt: number
    expiresAt?: number
    user: { _id: Id<'users'>; name?: string; email: string } | null
    grantedByUser: { name?: string; email: string } | null
  }
  allowedPermissions: string[]
  onUpdate: (permissionId: Id<'variablePermissions'>, newLevel: PermissionLevel) => Promise<void>
  onRevoke: (userId: Id<'users'>) => Promise<void>
}

function PermissionRow({ permission, allowedPermissions, onUpdate, onRevoke }: PermissionRowProps) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handlePermissionChange = async (newLevel: PermissionLevel) => {
    setIsUpdating(true)
    try {
      await onUpdate(permission._id, newLevel)
    } finally {
      setIsUpdating(false)
    }
  }

  const permissionColors: Record<string, string> = {
    read: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    write: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
          {(permission.user?.name ?? permission.user?.email ?? 'U')[0].toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {permission.user?.name ?? permission.user?.email ?? 'Unknown User'}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Granted by {permission.grantedByUser?.name ?? permission.grantedByUser?.email ?? 'Unknown'}
            {' · '}
            {new Date(permission.grantedAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={permission.permission}
          onChange={(e) => handlePermissionChange(e.target.value as PermissionLevel)}
          disabled={isUpdating}
          className={`rounded-full px-3 py-1 text-xs font-medium ${permissionColors[permission.permission] ?? ''} border-0 focus:outline-none focus:ring-2 focus:ring-zinc-400`}
        >
          {allowedPermissions.includes('read') && <option value="read">Read</option>}
          {allowedPermissions.includes('write') && <option value="write">Write</option>}
          {allowedPermissions.includes('admin') && <option value="admin">Admin</option>}
        </select>
        <button
          onClick={() => onRevoke(permission.userId)}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Revoke access"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
