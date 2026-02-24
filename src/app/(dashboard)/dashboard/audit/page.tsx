'use client'

import { useState } from 'react'

// Mock audit logs - would come from Convex in production
const mockAuditLogs: AuditLog[] = []

interface AuditLog {
  id: string
  action: string
  userId: string
  userName: string
  userEmail: string
  projectId?: string
  projectName?: string
  variableId?: string
  variableKey?: string
  details?: string
  ipAddress?: string
  createdAt: number
}

const actionLabels: Record<string, string> = {
  'org.created': 'Organization created',
  'org.updated': 'Organization updated',
  'org.deleted': 'Organization deleted',
  'org.member_added': 'Member added',
  'org.member_removed': 'Member removed',
  'org.member_role_changed': 'Member role changed',
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'project.deleted': 'Project deleted',
  'variable.created': 'Variable created',
  'variable.updated': 'Variable updated',
  'variable.deleted': 'Variable deleted',
  'variable.accessed': 'Variable accessed',
  'variable.exported': 'Variable exported',
  'permission.granted': 'Permission granted',
  'permission.revoked': 'Permission revoked',
  'permission.updated': 'Permission updated',
  'invitation.sent': 'Invitation sent',
  'invitation.accepted': 'Invitation accepted',
  'invitation.declined': 'Invitation declined',
  'invitation.expired': 'Invitation expired',
  'access.token_created': 'Access token created',
  'access.token_revoked': 'Access token revoked',
  'access.extension_linked': 'Extension linked',
  'access.extension_unlinked': 'Extension unlinked',
}

const actionCategories = [
  { value: 'all', label: 'All Events' },
  { value: 'org', label: 'Organization' },
  { value: 'project', label: 'Projects' },
  { value: 'variable', label: 'Variables' },
  { value: 'permission', label: 'Permissions' },
  { value: 'invitation', label: 'Invitations' },
  { value: 'access', label: 'Access' },
]

export default function AuditPage() {
  const [logs] = useState<AuditLog[]>(mockAuditLogs)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [dateRange, setDateRange] = useState('7d')

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchQuery === '' ||
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.projectName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (log.variableKey?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)

    const matchesCategory =
      selectedCategory === 'all' || log.action.startsWith(selectedCategory + '.')

    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Track all activity across your organization
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by user, action, or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
          />
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
        >
          {actionCategories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>

        {/* Date Range Filter */}
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>

        {/* Export */}
        <button className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
      </div>

      {/* Audit Logs */}
      {filteredLogs.length === 0 ? (
        <EmptyState hasLogs={logs.length > 0} />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredLogs.map((log) => (
              <AuditLogRow key={log.id} log={log} />
            ))}
          </div>
        </div>
      )}

      {/* Compliance Info */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Compliance & Security
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              All audit logs are retained for 90 days on the free tier and 365 days on the pro tier.
              Logs include IP addresses and user agents for security analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ hasLogs }: { hasLogs: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {hasLogs ? 'No matching events' : 'No audit events yet'}
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {hasLogs
          ? 'Try adjusting your search or filters.'
          : 'Activity will be recorded as you use ENV Connect.'}
      </p>
    </div>
  )
}

function AuditLogRow({ log }: { log: AuditLog }) {
  const actionLabel = actionLabels[log.action] || log.action

  return (
    <div className="flex items-start gap-4 px-6 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {log.userName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-900 dark:text-zinc-100">
          <span className="font-medium">{log.userName}</span>{' '}
          <span className="text-zinc-600 dark:text-zinc-400">{actionLabel}</span>
          {log.projectName && (
            <>
              {' '}
              in{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {log.projectName}
              </span>
            </>
          )}
          {log.variableKey && (
            <>
              {' '}
              <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
                {log.variableKey}
              </code>
            </>
          )}
        </p>
        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{new Date(log.createdAt).toLocaleString()}</span>
          {log.ipAddress && (
            <>
              <span>•</span>
              <span>{log.ipAddress}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
