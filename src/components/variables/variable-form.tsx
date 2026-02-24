'use client'

import { useState, useEffect } from 'react'
import { ENVIRONMENTS, type Environment } from '@/constants/project'

export interface VariableFormData {
  key: string
  value: string
  description: string
  environments: Environment[]
  isSensitive: boolean
}

interface VariableFormProps {
  initialData?: Partial<VariableFormData>
  onSubmit: (data: VariableFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  isEditing?: boolean
}

const defaultFormData: VariableFormData = {
  key: '',
  value: '',
  description: '',
  environments: ['development'],
  isSensitive: false,
}

export function VariableForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isEditing = false,
}: VariableFormProps) {
  const [formData, setFormData] = useState<VariableFormData>(() => ({
    ...defaultFormData,
    ...initialData,
  }))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showValue, setShowValue] = useState(!initialData?.isSensitive)

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
      }))
    }
  }, [initialData])

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/^[0-9]/, '_')
    setFormData((prev) => ({ ...prev, key: value }))
  }

  const handleEnvironmentToggle = (env: Environment) => {
    setFormData((prev) => {
      const environments = prev.environments.includes(env)
        ? prev.environments.filter((e) => e !== env)
        : [...prev.environments, env]
      return { ...prev, environments }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.key.trim()) {
      setError('Key is required')
      return
    }

    if (!formData.value.trim() && !isEditing) {
      setError('Value is required')
      return
    }

    if (formData.environments.length === 0) {
      setError('At least one environment is required')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Key field */}
      <div>
        <label htmlFor="key" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Key <span className="text-red-500">*</span>
        </label>
        <input
          id="key"
          type="text"
          value={formData.key}
          onChange={handleKeyChange}
          disabled={isEditing}
          placeholder="DATABASE_URL"
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:disabled:bg-zinc-900"
        />
        {isEditing && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Variable key cannot be changed after creation
          </p>
        )}
      </div>

      {/* Value field */}
      <div>
        <label htmlFor="value" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Value {!isEditing && <span className="text-red-500">*</span>}
          {isEditing && <span className="text-zinc-400">(leave empty to keep current)</span>}
        </label>
        <div className="relative mt-1">
          <input
            id="value"
            type={showValue ? 'text' : 'password'}
            value={formData.value}
            onChange={(e) => setFormData((prev) => ({ ...prev, value: e.target.value }))}
            placeholder={isEditing ? 'Enter new value or leave empty' : 'postgres://...'}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 pr-10 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <button
            type="button"
            onClick={() => setShowValue((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            {showValue ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Description field */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Description <span className="text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Brief description of what this variable is used for..."
          rows={2}
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
      </div>

      {/* Environments */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Environments <span className="text-red-500">*</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              type="button"
              onClick={() => handleEnvironmentToggle(env as Environment)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                formData.environments.includes(env as Environment)
                  ? env === 'production'
                    ? 'bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700'
                    : env === 'staging'
                    ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-700'
                    : 'bg-green-100 text-green-700 ring-1 ring-green-300 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              }`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Sensitive toggle */}
      <div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={formData.isSensitive}
            onChange={(e) => setFormData((prev) => ({ ...prev, isSensitive: e.target.checked }))}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            Mark as sensitive <span className="text-zinc-400">(masks value by default)</span>
          </span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  )
}
