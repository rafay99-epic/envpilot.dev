'use client'

import { useState } from 'react'
import { useAuthContext } from '@/components/auth'
import { PERMISSIONS } from '@/lib/auth'

type SettingsTab = 'general' | 'organization' | 'integrations' | 'security'

export default function SettingsPage() {
  const { user, organization, hasPermission } = useAuthContext()
  const canManageOrg = hasPermission(PERMISSIONS.ORG_ADMIN)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const tabs: { id: SettingsTab; label: string; requiresAdmin?: boolean }[] = [
    { id: 'general', label: 'General' },
    { id: 'organization', label: 'Organization', requiresAdmin: true },
    { id: 'integrations', label: 'Integrations' },
    { id: 'security', label: 'Security' },
  ]

  const filteredTabs = tabs.filter(tab => !tab.requiresAdmin || canManageOrg)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your account and organization preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8">
          {filteredTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl">
        {activeTab === 'general' && <GeneralSettings user={user} />}
        {activeTab === 'organization' && <OrganizationSettings organization={organization} />}
        {activeTab === 'integrations' && <IntegrationsSettings />}
        {activeTab === 'security' && <SecuritySettings />}
      </div>
    </div>
  )
}

function GeneralSettings({ user }: { user: { firstName: string | null; lastName: string | null; email: string } | null }) {
  const [firstName, setFirstName] = useState(user?.firstName || '')
  const [lastName, setLastName] = useState(user?.lastName || '')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Profile
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Your personal information
        </p>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Last Name
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={user?.email || ''}
              disabled
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Email cannot be changed. Contact support if you need to update it.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function OrganizationSettings({ organization }: { organization: { name: string; slug: string | null } | null }) {
  const [name, setName] = useState(organization?.name || '')
  const [slug, setSlug] = useState(organization?.slug || '')

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Organization Details
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your organization settings
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Organization Name
            </label>
            <input
              type="text"
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="orgSlug" className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Organization URL
            </label>
            <div className="mt-1 flex rounded-lg border border-zinc-200 dark:border-zinc-700">
              <span className="flex items-center rounded-l-lg border-r border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                envconnect.app/
              </span>
              <input
                type="text"
                id="orgSlug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-r-lg bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Save Changes
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
          Danger Zone
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Irreversible actions for your organization
        </p>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-red-200 p-4 dark:border-red-900">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Delete Organization
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Permanently delete this organization and all its data
            </p>
          </div>
          <button className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500 dark:text-red-500 dark:hover:bg-red-900/20">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function IntegrationsSettings() {
  return (
    <div className="space-y-6" id="integrations">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          IDE Extensions
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Install extensions to sync variables to your local environment
        </p>

        <div className="mt-6 space-y-4">
          <IntegrationCard
            name="VS Code Extension"
            description="Sync environment variables directly to your workspace"
            icon={
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
              </svg>
            }
            installed={false}
          />
          <IntegrationCard
            name="Cursor Extension"
            description="ENV Connect support for Cursor editor"
            icon={
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                <span className="text-lg font-bold">C</span>
              </div>
            }
            installed={false}
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          CLI Tool
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage variables from your terminal
        </p>

        <div className="mt-6 rounded-lg bg-zinc-900 p-4 dark:bg-zinc-950">
          <code className="text-sm text-green-400">
            npm install -g @envconnect/cli
          </code>
        </div>
      </div>
    </div>
  )
}

function IntegrationCard({
  name,
  description,
  icon,
  installed,
}: {
  name: string
  description: string
  icon: React.ReactNode
  installed: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex items-center gap-4">
        <div className="text-zinc-600 dark:text-zinc-400">{icon}</div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {name}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        </div>
      </div>
      <button
        className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          installed
            ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
        }`}
      >
        {installed ? 'Installed' : 'Install'}
      </button>
    </div>
  )
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Active Sessions
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your active sessions across devices
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Current Session
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  This device • Just now
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Active
            </span>
          </div>
        </div>

        <div className="mt-6">
          <button className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-500 dark:text-red-500 dark:hover:bg-red-900/20">
            Sign Out All Other Sessions
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Access Tokens
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage API tokens for CLI and extensions
        </p>

        <div className="mt-6">
          <button className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Generate New Token
          </button>
        </div>
      </div>
    </div>
  )
}

function BillingSettings() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Billing (Disabled)
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Billing is disabled for pre-alpha. All teams currently have full access.
        </p>
      </div>
    </div>
  )
}
