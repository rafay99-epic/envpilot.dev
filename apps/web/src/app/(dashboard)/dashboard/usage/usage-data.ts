import type { LucideIcon } from "lucide-react";
import {
  FolderKanban,
  Building2,
  Users,
  KeyRound,
  Mail,
  History,
  Upload,
  Download,
  Trash2,
  Tag,
  Terminal,
  Puzzle,
  Shield,
  ScrollText,
  KeySquare,
  Share2,
  Keyboard,
  Palette,
  BarChart3,
  Headphones,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Shared props every layout receives
// ---------------------------------------------------------------------------

export interface UsageLayoutProps {
  tier: string;
  isFree: boolean;
  enforcementEnabled: boolean;
  orgCount: number | null;
  usage: {
    projects?: number;
    teamMembers?: number;
    pendingInvitations?: number;
    maxVariablesInProject?: number;
    maxVariablesProjectName?: string;
    variablesPerProject?: {
      projectId: string;
      projectName: string;
      count: number;
    }[];
    activeShares?: number;
    rotationEnabledVars?: number;
  } | null;
  meterLimits: {
    orgs: number | null;
    projects: number | null;
    teamMembers: number | null;
    variables: number | null;
    invitations: number | null;
    activeShares: number | null;
    rotationLimit: number | null;
    auditDays: number;
    analyticsDays: number;
  };
  isAllowed: (key: string) => boolean;
  getLimit: (key: string) => number | null | undefined;
  onUpgrade: () => void;
}

// ---------------------------------------------------------------------------
// Feature display types
// ---------------------------------------------------------------------------

export type FeatureDisplayItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  isNumeric?: boolean;
  numericSuffix?: string;
};

export type FeatureCategory = {
  name: string;
  label: string;
  features: FeatureDisplayItem[];
};

// ---------------------------------------------------------------------------
// All feature categories — matches featureRegistry.ts seed
// ---------------------------------------------------------------------------

export const featureCategories: FeatureCategory[] = [
  {
    name: "Resources",
    label: "Resource Limits",
    features: [
      {
        key: "max_projects",
        label: "Projects",
        icon: FolderKanban,
        description: "Total projects you can create",
        isNumeric: true,
      },
      {
        key: "max_variables_per_project",
        label: "Variables per Project",
        icon: KeyRound,
        description: "Environment variables per project",
        isNumeric: true,
      },
      {
        key: "max_organizations",
        label: "Organizations",
        icon: Building2,
        description: "Organizations you can own",
        isNumeric: true,
      },
    ],
  },
  {
    name: "Team",
    label: "Team & Collaboration",
    features: [
      {
        key: "max_team_members",
        label: "Team Members",
        icon: Users,
        description: "Members per organization",
        isNumeric: true,
      },
      {
        key: "max_invitations",
        label: "Pending Invitations",
        icon: Mail,
        description: "Outstanding invites at a time",
        isNumeric: true,
      },
    ],
  },
  {
    name: "Variables",
    label: "Variable Management",
    features: [
      {
        key: "variable_version_history",
        label: "Version History",
        icon: History,
        description: "Track and rollback variable changes",
      },
      {
        key: "bulk_import",
        label: "Bulk Import",
        icon: Upload,
        description: "Import variables from .env files",
      },
      {
        key: "bulk_export",
        label: "Bulk Export",
        icon: Download,
        description: "Export variables in multiple formats",
      },
      {
        key: "bulk_delete",
        label: "Bulk Delete",
        icon: Trash2,
        description: "Delete multiple variables at once",
      },
      {
        key: "variable_tags",
        label: "Variable Tags",
        icon: Tag,
        description: "Organize variables with tags",
      },
    ],
  },
  {
    name: "Tools",
    label: "Developer Tools",
    features: [
      {
        key: "api_access",
        label: "API Access",
        icon: Terminal,
        description: "Programmatic access to your variables",
      },
      {
        key: "cli_access",
        label: "CLI Access",
        icon: Terminal,
        description: "Manage variables from the terminal",
      },
      {
        key: "extension_access",
        label: "VS Code Extension",
        icon: Puzzle,
        description: "Sync variables in your editor",
      },
    ],
  },
  {
    name: "Security",
    label: "Security & Compliance",
    features: [
      {
        key: "granular_permissions",
        label: "Granular Permissions",
        icon: Shield,
        description: "Per-variable access controls",
      },
      {
        key: "audit_log_retention_days",
        label: "Audit Log Retention",
        icon: ScrollText,
        description: "How long audit logs are kept",
        isNumeric: true,
        numericSuffix: "days",
      },
      {
        key: "secret_rotation",
        label: "Secret Rotation",
        icon: KeySquare,
        description: "Automated secret rotation & expiry",
      },
      {
        key: "secret_rotation_limit",
        label: "Rotation-Enabled Variables",
        icon: KeySquare,
        description: "Variables with rotation enabled",
        isNumeric: true,
      },
      {
        key: "secret_sharing",
        label: "Secret Sharing",
        icon: Share2,
        description: "Generate secure sharing links",
      },
      {
        key: "max_active_shares",
        label: "Active Share Links",
        icon: Share2,
        description: "Concurrent active sharing links",
        isNumeric: true,
      },
      {
        key: "sso_enabled",
        label: "SSO",
        icon: Shield,
        description: "Single sign-on integration",
      },
    ],
  },
  {
    name: "Customization",
    label: "Customization",
    features: [
      {
        key: "keyboard_shortcuts_custom",
        label: "Custom Keyboard Shortcuts",
        icon: Keyboard,
        description: "Personalize keyboard bindings",
      },
      {
        key: "custom_branding",
        label: "Custom Branding",
        icon: Palette,
        description: "White-label your dashboard",
      },
    ],
  },
  {
    name: "Analytics",
    label: "Analytics",
    features: [
      {
        key: "analytics_retention_days",
        label: "Analytics Retention",
        icon: BarChart3,
        description: "How long analytics data is kept",
        isNumeric: true,
        numericSuffix: "days",
      },
    ],
  },
  {
    name: "Support",
    label: "Support",
    features: [
      {
        key: "priority_support",
        label: "Priority Support",
        icon: Headphones,
        description: "Fast-track responses from the team",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tier value maps — mirrors seedDefaultTierFeatures in featureRegistry.ts
// ---------------------------------------------------------------------------

export const PRO_VALUES: Record<string, string> = {
  max_projects: "Unlimited",
  max_variables_per_project: "Unlimited",
  max_organizations: "Unlimited",
  max_team_members: "Unlimited",
  max_invitations: "Unlimited",
  variable_version_history: "true",
  bulk_import: "true",
  bulk_delete: "true",
  bulk_export: "true",
  variable_tags: "true",
  api_access: "true",
  extension_access: "true",
  cli_access: "true",
  granular_permissions: "true",
  audit_log_retention_days: "365",
  sso_enabled: "false",
  secret_rotation: "true",
  secret_rotation_limit: "Unlimited",
  secret_sharing: "true",
  max_active_shares: "Unlimited",
  keyboard_shortcuts_custom: "true",
  custom_branding: "true",
  analytics_retention_days: "30",
  priority_support: "true",
};

export const FREE_VALUES: Record<string, string> = {
  max_projects: "3",
  max_variables_per_project: "50",
  max_organizations: "1",
  max_team_members: "3",
  max_invitations: "5",
  variable_version_history: "false",
  bulk_import: "false",
  bulk_delete: "true",
  bulk_export: "false",
  variable_tags: "true",
  api_access: "true",
  extension_access: "false",
  cli_access: "false",
  granular_permissions: "true",
  audit_log_retention_days: "7",
  sso_enabled: "false",
  secret_rotation: "false",
  secret_rotation_limit: "7",
  secret_sharing: "false",
  max_active_shares: "0",
  keyboard_shortcuts_custom: "true",
  custom_branding: "false",
  analytics_retention_days: "7",
  priority_support: "false",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatFeatureValue(
  raw: string | undefined,
  isNumeric?: boolean,
  suffix?: string
): { text: string; enabled: boolean } {
  if (!raw || raw === "false") return { text: "", enabled: false };
  if (raw === "true") return { text: "", enabled: true };
  if (raw === "null" || raw === "Unlimited")
    return { text: "Unlimited", enabled: true };
  if (raw === "0") return { text: "0", enabled: false };
  const num = Number(raw);
  if (!isNaN(num) && isNumeric) {
    return {
      text: suffix ? `${num} ${suffix}` : String(num),
      enabled: num > 0,
    };
  }
  return { text: raw, enabled: true };
}
