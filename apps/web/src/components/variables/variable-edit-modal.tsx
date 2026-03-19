"use client";

import { DrawerPanel } from "@/components/ui";
import { VariableForm, type VariableFormData } from "./variable-form";
import type { Id } from "@convex/_generated/dataModel";
import type { Environment } from "@/constants/project";

interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  rotationFrequencyDays?: number;
}

interface VariableEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  variable: Variable | null;
  onSave: (
    variableId: Id<"environmentVariables">,
    data: VariableFormData
  ) => Promise<void>;
  showRotation?: boolean;
}

export function VariableEditModal({
  isOpen,
  onClose,
  variable,
  onSave,
  showRotation = false,
}: VariableEditModalProps) {
  const initialData: Partial<VariableFormData> | undefined = variable
    ? {
        key: variable.key,
        value: "", // Empty for security - user must re-enter to change
        description: variable.description || "",
        environments: variable.environments as Environment[],
        isSensitive: variable.isSensitive,
        rotationFrequencyDays: variable.rotationFrequencyDays,
      }
    : undefined;

  const handleSubmit = async (data: VariableFormData) => {
    if (!variable) return;
    await onSave(variable._id, data);
    onClose();
  };

  return (
    <DrawerPanel isOpen={isOpen} onClose={onClose} title="Edit Variable">
      {initialData && (
        <VariableForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel="Update Variable"
          isEditing
          showRotation={showRotation}
        />
      )}
    </DrawerPanel>
  );
}
