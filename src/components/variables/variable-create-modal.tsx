"use client";

import { Modal } from "@/components/ui";
import { VariableForm, type VariableFormData } from "./variable-form";

interface VariableCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: VariableFormData) => Promise<void>;
  title?: string;
  submitLabel?: string;
}

export function VariableCreateModal({
  isOpen,
  onClose,
  onCreate,
  title = "Create Variable",
  submitLabel = "Create Variable",
}: VariableCreateModalProps) {
  const handleSubmit = async (data: VariableFormData) => {
    await onCreate(data);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <VariableForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        submitLabel={submitLabel}
      />
    </Modal>
  );
}
