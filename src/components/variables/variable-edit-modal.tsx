'use client'

import { Modal } from '@/components/ui'
import { VariableForm, type VariableFormData } from './variable-form'
import type { Id } from '../../../convex/_generated/dataModel'
import type { Environment } from '@/constants/project'

interface Variable {
  _id: Id<'environmentVariables'>
  key: string
  description?: string
  environments: string[]
  isSensitive: boolean
}

interface VariableEditModalProps {
  isOpen: boolean
  onClose: () => void
  variable: Variable | null
  onSave: (variableId: Id<'environmentVariables'>, data: VariableFormData) => Promise<void>
}

export function VariableEditModal({ isOpen, onClose, variable, onSave }: VariableEditModalProps) {
  if (!variable) return null

  const initialData: Partial<VariableFormData> = {
    key: variable.key,
    value: '', // Empty for security - user must re-enter to change
    description: variable.description || '',
    environments: variable.environments as Environment[],
    isSensitive: variable.isSensitive,
  }

  const handleSubmit = async (data: VariableFormData) => {
    await onSave(variable._id, data)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Variable" size="lg">
      <VariableForm
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={onClose}
        submitLabel="Update Variable"
        isEditing
      />
    </Modal>
  )
}
