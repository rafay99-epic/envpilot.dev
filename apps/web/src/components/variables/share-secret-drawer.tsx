"use client";

import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui/drawer-panel";
import { ShareLinkForm } from "@/components/shared/share-link-form";

interface ShareSecretDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  variable: {
    _id: Id<"environmentVariables">;
    key: string;
  };
  organizationId: string;
  projectId: string;
  onRevealValue: () => Promise<string | null>;
}

export function ShareSecretDrawer({
  isOpen,
  onClose,
  variable,
  organizationId,
  projectId,
  onRevealValue,
}: ShareSecretDrawerProps) {
  return (
    <DrawerPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Share Secret"
      width="lg"
    >
      <div className="space-y-6">
        {/* Variable Key */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">
            Variable
          </label>
          <code className="block rounded-lg px-3 py-2 font-mono text-sm font-semibold bg-surface-raised text-ink">
            {variable.key}
          </code>
        </div>

        <ShareLinkForm
          organizationId={organizationId}
          projectId={projectId}
          buildPayload={async () => {
            const plaintext = await onRevealValue();
            if (!plaintext) {
              throw new Error("Failed to retrieve variable value");
            }
            return `${variable.key}=${plaintext}`;
          }}
          extraShareArgs={{
            variableId: variable._id,
            variableKey: variable.key,
          }}
          oneTimeDestroyedMessage="The secret will be permanently destroyed after the first view."
          sentry={{
            source: "share-drawer",
            extra: { variableKey: variable.key },
          }}
          onClose={onClose}
        />
      </div>
    </DrawerPanel>
  );
}
