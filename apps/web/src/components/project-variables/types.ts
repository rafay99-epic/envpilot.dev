import type { Id } from "@convex/_generated/dataModel";

// Row shape the project variables list, its dialogs, and the page all share.
export interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  vaultRef?: string;
  permission?: "read" | "write" | null;
  rotationFrequencyDays?: number;
  expiresAt?: number;
  rotationStatus?: "active" | "expiring_soon" | "expired";
  tagIds?: string[];
}

export interface VersionRecord {
  _id: Id<"variableVersions">;
  version: number;
  description?: string;
  environments: string[];
  changeReason?: string;
  createdAt: number;
  changedByUser: { name?: string; email: string } | null;
}

// The variable-related capability flags the panel and its children gate on.
export interface VariableCapabilities {
  canCreateVariable: boolean;
  canAddVariable: boolean;
  canUpdateVariable: boolean;
  canDeleteVariable: boolean;
  canShare: boolean;
  canManageShares: boolean;
}
