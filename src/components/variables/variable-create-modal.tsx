'use client'

import { Modal } from '@/components/ui'
import { VariableForm, type VariableFormData } from './variable-form'

interface VariableCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (data: VariableFormData) => Promise<void>
}

export function VariableCreateModal({ isOpen, onClose, onCreate }: VariableCreateModalProps) {
  const handleSubmit = async (data: VariableFormData) => {
    await onCreate(data)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Variable" size="lg">
      <VariableForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        submitLabel="Create Variable"
      />
    </Modal>
  )
}
