'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { useAuthContext } from '@/components/auth'
import { PERMISSIONS } from '@/lib/auth'
import { ENVIRONMENTS, DEFAULT_PROJECT_ICON, DEFAULT_PROJECT_COLOR } from '@/constants/project'
import { ConfirmDialog } from '@/components/ui'
import {
  VariableCreateModal,
  VariableEditModal,
  VariableHistory,
  VariableListItem,
  type VariableFormData,
} from '@/components/variables'

interface ProjectPageProps {
  params: Promise<{ slug: string }>
}

interface Project {
  _id: Id<'projects'>
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
  organizationId: Id<'organizations'>
  createdAt: number
  updatedAt: number
}

interface Variable {
  _id: Id<'environmentVariables'>
  key: string
  description?: string
  environments: string[]
  isSensitive: boolean
  version: number
  createdAt: number
  updatedAt: number
}

interface VersionRecord {
  _id: Id<'variableVersions'>
  version: number
  description?: string
  environments: string[]
  changeReason?: string
  createdAt: number
  changedByUser: { name?: string; email: string } | null
}

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = use(params)
  const { hasPermission } = useAuthContext()
  const canUpdateProject = hasPermission(PERMISSIONS.PROJECT_UPDATE)
  const canCreateVariable = hasPermission(PERMISSIONS.VARIABLE_CREATE)
  const canUpdateVariable = hasPermission(PERMISSIONS.VARIABLE_UPDATE)
  const canDeleteVariable = hasPermission(PERMISSIONS.VARIABLE_DELETE)

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('all')

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null)
  const [deletingVariable, setDeletingVariable] = useState<Variable | null>(null)
  const [historyVariable, setHistoryVariable] = useState<Variable | null>(null)
  const [variableHistory, setVariableHistory] = useState<VersionRecord[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  // User state
  const [convexUserId, setConvexUserId] = useState<Id<'users'> | null>(null)

  // Fetch user data
  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch('/api/users/me')
        const data = await response.json()
        if (data.convexUserId) {
          setConvexUserId(data.convexUserId)
        }
      } catch {
        // User fetch failed - will be handled by auth redirect
      }
    }
    fetchUser()
  }, [])

  // Fetch project data
  useEffect(() => {
    async function fetchProject() {
      try {
        const orgsResponse = await fetch('/api/organizations')
        const orgsData = await orgsResponse.json()

        if (!orgsData.organizations || orgsData.organizations.length === 0) {
          setError('No organization found')
          setIsLoading(false)
          return
        }

        const organizationId = orgsData.organizations[0]._id

        const projectsResponse = await fetch(`/api/projects?organizationId=${organizationId}`)
        const projectsData = await projectsResponse.json()

        const foundProject = projectsData.projects?.find((p: Project) => p.slug === slug)

        if (!foundProject) {
          setError('Project not found')
        } else {
          setProject(foundProject)
        }
      } catch {
        setError('Failed to load project')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProject()
  }, [slug])

  // Query variables for the project
  const variables = useQuery(
    api.variables.listByProject,
    project ? { projectId: project._id, environment: selectedEnvironment === 'all' ? undefined : selectedEnvironment } : 'skip'
  )

  const createVariable = useMutation(api.variables.create)
  const updateVariable = useMutation(api.variables.update)
  const deleteVariable = useMutation(api.variables.remove)
  const rollbackVariable = useMutation(api.variables.rollback)

  // Handlers
  const handleCreateVariable = async (data: VariableFormData) => {
    if (!project || !convexUserId) return

    await createVariable({
      key: data.key,
      vaultRef: `vault_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      description: data.description || undefined,
      environments: data.environments,
      projectId: project._id,
      isSensitive: data.isSensitive,
      createdBy: convexUserId,
    })
  }

  const handleUpdateVariable = async (variableId: Id<'environmentVariables'>, data: VariableFormData) => {
    if (!convexUserId) return

    await updateVariable({
      variableId,
      vaultRef: data.value ? `vault_${Date.now()}_${Math.random().toString(36).substring(7)}` : undefined,
      description: data.description || undefined,
      environments: data.environments,
      isSensitive: data.isSensitive,
      updatedBy: convexUserId,
      changeReason: 'Updated via dashboard',
    })
  }

  const handleDeleteVariable = async () => {
    if (!deletingVariable || !convexUserId) return

    await deleteVariable({
      variableId: deletingVariable._id,
      deletedBy: convexUserId,
    })
    setDeletingVariable(null)
  }

  const handleViewHistory = async (variable: Variable) => {
    setHistoryVariable(variable)
    setIsLoadingHistory(true)
    setHistoryError(null)
    try {
      const response = await fetch(`/api/variables/${variable._id}/history`)
      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`)
      }
      const data = await response.json()
      setVariableHistory(data.history || [])
    } catch (err) {
      setHistoryError('Failed to load version history. Please try again.')
      setVariableHistory([])
      console.error('History fetch error:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleRollback = async (targetVersion: number) => {
    if (!historyVariable || !convexUserId) return

    await rollbackVariable({
      variableId: historyVariable._id,
      targetVersion,
      rolledBackBy: convexUserId,
    })

    // Refresh history
    await handleViewHistory(historyVariable)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
          <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {error || 'Project not found'}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/projects"
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg text-xl"
            style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
          >
            {project.icon || DEFAULT_PROJECT_ICON}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {project.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canUpdateProject && (
            <Link
              href={`/dashboard/projects/${project.slug}/settings`}
              className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Environment Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Environment:
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedEnvironment('all')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedEnvironment === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              onClick={() => setSelectedEnvironment(env)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                selectedEnvironment === env
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Variables */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Environment Variables
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {variables?.length ?? 0} variable{variables?.length !== 1 ? 's' : ''}
              {selectedEnvironment !== 'all' && ` in ${selectedEnvironment}`}
            </p>
          </div>
          {canCreateVariable && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Variable
            </button>
          )}
        </div>

        {/* Variables List */}
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {variables === undefined ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
            </div>
          ) : variables.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No variables yet
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Add your first environment variable to get started.
              </p>
              {canCreateVariable && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Variable
                </button>
              )}
            </div>
          ) : (
            variables.map((variable: Variable) => (
              <VariableListItem
                key={variable._id}
                variable={variable}
                onEdit={() => setEditingVariable(variable)}
                onDelete={() => setDeletingVariable(variable)}
                onViewHistory={() => handleViewHistory(variable)}
                canEdit={canUpdateVariable}
                canDelete={canDeleteVariable}
              />
            ))
          )}
        </div>
      </div>

      {/* Create Variable Modal */}
      <VariableCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateVariable}
      />

      {/* Edit Variable Modal */}
      <VariableEditModal
        isOpen={!!editingVariable}
        onClose={() => setEditingVariable(null)}
        variable={editingVariable}
        onSave={handleUpdateVariable}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingVariable}
        onClose={() => setDeletingVariable(null)}
        onConfirm={handleDeleteVariable}
        title="Delete Variable"
        message={`Are you sure you want to delete "${deletingVariable?.key}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Variable History Modal */}
      {historyVariable && (
        <VariableHistory
          isOpen={!!historyVariable}
          onClose={() => {
            setHistoryVariable(null)
            setVariableHistory([])
            setHistoryError(null)
          }}
          variableKey={historyVariable.key}
          currentVersion={historyVariable.version}
          history={variableHistory}
          onRollback={handleRollback}
          canRollback={hasPermission(PERMISSIONS.VARIABLE_ROLLBACK)}
          isLoading={isLoadingHistory}
          error={historyError}
        />
      )}
    </div>
  )
}
