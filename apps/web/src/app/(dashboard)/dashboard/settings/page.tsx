"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthContext } from "@/components/auth";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  KeyRound,
  Keyboard,
  Lock,
  Monitor,
  Pencil,
  Receipt,
  RotateCcw,
  Settings,
  Shield,
  ShieldAlert,
  Terminal,
  Users,
  Variable,
  X,
  type LucideIcon,
} from "lucide-react";
import { FeatureGate } from "@/components/tier/FeatureGate";
import type { Id } from "@convex/_generated/dataModel";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { SHORTCUTS, getEffectiveShortcuts } from "@/hooks/useKeyboardShortcuts";
import { validateBinding } from "@/lib/shortcut-validation";
import {
  useSubscription,
  useCreatePortalSession,
} from "@/hooks/queries/useBillingQuery";
import { TierBadge } from "@/components/tier/TierBadge";
import { usePaymentsEnabled } from "@/hooks/usePaymentsEnabled";
import Link from "next/link";
import { PageHeader } from "@envpilot/ui";

type SettingsTab =
  | "general"
  | "notifications"
  | "integrations"
  | "security"
  | "customization"
  | "billing";

const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "notifications",
  "integrations",
  "security",
  "customization",
  "billing",
];

export default function SettingsPage() {
  const { user, organization } = useAuthContext();
  // Deep-linkable via ?tab=<id> (e.g. the usage page's "Manage billing"
  // link). The URL provides the initial tab; clicking a tab overrides it.
  // Derived — no effect, no hydration mismatch (searchParams resolve the
  // same on server and client).
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") as SettingsTab | null;
  const [selectedTab, setSelectedTab] = useState<SettingsTab | null>(null);
  const activeTab: SettingsTab =
    selectedTab ??
    (urlTab && SETTINGS_TABS.includes(urlTab) ? urlTab : "general");
  const setActiveTab = setSelectedTab;

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "notifications", label: "Notifications" },
    { id: "integrations", label: "Integrations" },
    { id: "security", label: "Security" },
    { id: "customization", label: "Customization" },
    { id: "billing", label: "Billing" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Settings}
        title="Account Settings"
        description="Manage your account preferences"
      />

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-green-400 text-green-400"
                  : "border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl">
        {activeTab === "general" && <GeneralSettings user={user} />}
        {activeTab === "notifications" && <NotificationSettings />}
        {activeTab === "integrations" && <IntegrationsSettings />}
        {activeTab === "security" && <SecuritySettings />}
        {activeTab === "customization" && (
          <FeatureGate
            organizationId={organization?.id as Id<"organizations"> | undefined}
            featureKey="keyboard_shortcuts_custom"
            featureName="Custom Keyboard Shortcuts"
            fallbackVariant="card"
          >
            <CustomizationSettings />
          </FeatureGate>
        )}
        {activeTab === "billing" && (
          <BillingSettings
            organizationId={organization?.id}
            organizationSlug={organization?.slug ?? undefined}
            alreadyProNotice={searchParams.get("notice") === "already-pro"}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// General Settings
// ============================================================

function GeneralSettings({
  user,
}: {
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    createdAt: Date;
  } | null;
}) {
  const initialFirst = user?.firstName || "";
  const initialLast = user?.lastName || "";
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const hasChanges = firstName !== initialFirst || lastName !== initialLast;

  async function handleSave() {
    if (!hasChanges) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaveMessage({ type: "success", text: "Profile updated" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">Profile</h2>
        <p className="mt-1 text-sm text-zinc-500">Your personal information</p>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-zinc-300"
              >
                First Name
              </label>
              <TerminalInput
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-zinc-300"
              >
                Last Name
              </label>
              <TerminalInput
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-300"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              value={user?.email || ""}
              disabled
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-500"
            />
            <p className="mt-1 text-xs text-zinc-600">
              Email cannot be changed. Contact support if you need to update it.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {saveMessage && (
            <p
              className={`text-sm ${saveMessage.type === "success" ? "text-green-400" : "text-red-400"}`}
            >
              {saveMessage.text}
            </p>
          )}
          <TerminalButton
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </TerminalButton>
        </div>
      </TerminalCard>

      {/* Connected Account */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Connected Account
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Your authentication provider
        </p>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700/50">
              <Lock className="h-4 w-4 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">{user?.email}</p>
              <p className="text-xs text-zinc-500">
                Member since{" "}
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "long",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
          <TerminalBadge color="green">Authenticated via WorkOS</TerminalBadge>
        </div>
      </TerminalCard>

      {/* Quick Links */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Help &amp; Resources
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Common questions and documentation
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <a
            href="/faq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <ExternalLink className="h-3.5 w-3.5 text-green-400" />
            FAQ &amp; How It Works
          </a>
          <a
            href="/terms#billing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <ExternalLink className="h-3.5 w-3.5 text-green-400" />
            Billing Terms
          </a>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <ExternalLink className="h-3.5 w-3.5 text-green-400" />
            Privacy Policy
          </a>
          <a
            href="/support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-2.5 text-sm text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <ExternalLink className="h-3.5 w-3.5 text-green-400" />
            Contact Support
          </a>
        </div>
      </TerminalCard>
    </div>
  );
}

// ============================================================
// Notification Settings
// ============================================================

interface NotificationPrefs {
  variableChanges: boolean;
  memberUpdates: boolean;
  accessRequests: boolean;
  securityAlerts: boolean;
  rotationReminders: boolean;
}

function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    variableChanges: true,
    memberUpdates: true,
    accessRequests: true,
    securityAlerts: true,
    rotationReminders: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const res = await fetch("/api/users/me/preferences");
        if (res.ok) {
          const data = await res.json();
          if (data.emailNotifications) {
            setPrefs(data.emailNotifications);
          }
        }
      } catch {
        // Use defaults
      } finally {
        setIsLoading(false);
      }
    }
    fetchPreferences();
  }, []);

  async function handleToggle(key: keyof NotificationPrefs) {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs);
    setSavingKey(key);

    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: newPrefs }),
      });
    } catch {
      // Revert on error
      setPrefs(prefs);
    } finally {
      setSavingKey(null);
    }
  }

  const notifications: {
    key: keyof NotificationPrefs;
    label: string;
    description: string;
    icon: LucideIcon;
    activeColor: string;
  }[] = [
    {
      key: "variableChanges",
      label: "Variable changes",
      description: "When variables you have access to are modified",
      icon: Variable,
      activeColor: "text-blue-400",
    },
    {
      key: "memberUpdates",
      label: "Team updates",
      description: "When members join or leave your organization",
      icon: Users,
      activeColor: "text-purple-400",
    },
    {
      key: "accessRequests",
      label: "Access requests",
      description: "When someone requests access to variables",
      icon: KeyRound,
      activeColor: "text-amber-400",
    },
    {
      key: "securityAlerts",
      label: "Security alerts",
      description: "Session revocations and suspicious activity",
      icon: ShieldAlert,
      activeColor: "text-red-400",
    },
    {
      key: "rotationReminders",
      label: "Rotation reminders",
      description: "When secrets are approaching expiry",
      icon: RotateCcw,
      activeColor: "text-orange-400",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <TerminalCard>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
              />
            ))}
          </div>
        </TerminalCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Email Notifications
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Choose which email notifications you receive
        </p>

        <div className="mt-6 space-y-3">
          {notifications.map(
            ({ key, label, description, icon: Icon, activeColor }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-5 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-700/40">
                    <Icon
                      className={`h-5 w-5 ${prefs[key] ? activeColor : "text-zinc-500"}`}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{label}</p>
                    <p className="text-xs text-zinc-500">{description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(key)}
                  disabled={savingKey === key}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    prefs[key] ? "bg-green-500" : "bg-zinc-600"
                  } ${savingKey === key ? "opacity-50" : ""}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      prefs[key] ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            )
          )}
        </div>
      </TerminalCard>
    </div>
  );
}

// ============================================================
// Integrations Settings
// ============================================================

function IntegrationsSettings() {
  return (
    <div className="space-y-6" id="integrations">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          IDE Extensions
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Install extensions to sync variables to your local environment
        </p>

        <div className="mt-6 space-y-3">
          <IntegrationCard
            name="VS Code Extension"
            description="Sync environment variables directly to your workspace"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
              </svg>
            }
            installed={false}
            href="https://marketplace.visualstudio.com/items?itemName=EnvPilot.envpilot"
          />
          <IntegrationCard
            name="Cursor Extension"
            description="Envpilot support for Cursor editor"
            icon={
              <svg
                className="h-6 w-6"
                viewBox="0 0 466.73 532.09"
                fill="currentColor"
              >
                <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
              </svg>
            }
            installed={false}
            href="https://open-vsx.org/extension/envpilot/envpilot"
          />
          <IntegrationCard
            name="Antigravity Extension"
            description="Envpilot support for Antigravity editor"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 15" fill="none">
                <mask
                  id="ag-mask"
                  style={{ maskType: "alpha" }}
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width="16"
                  height="15"
                >
                  <path
                    d="M14.0777 13.984C14.945 14.6345 16.2458 14.2008 15.0533 13.0084C11.476 9.53949 12.2349 0 7.79033 0C3.34579 0 4.10461 9.53949 0.527295 13.0084C-0.773543 14.3092 0.635692 14.6345 1.50293 13.984C4.86344 11.7076 4.64663 7.69664 7.79033 7.69664C10.934 7.69664 10.7172 11.7076 14.0777 13.984Z"
                    fill="black"
                  />
                </mask>
                <g mask="url(#ag-mask)">
                  <g filter="url(#ag-f0)">
                    <path
                      d="M-0.658907 -3.2306C-0.922679 -0.906781 1.07986 1.22861 3.81388 1.53894C6.54791 1.84927 8.97811 0.217009 9.24188 -2.10681C9.50565 -4.43063 7.50312 -6.56602 4.76909 -6.87635C2.03506 -7.18667 -0.395135 -5.55442 -0.658907 -3.2306Z"
                      fill="#FFE432"
                    />
                  </g>
                  <g filter="url(#ag-f1)">
                    <path
                      d="M9.88233 4.36642C10.5673 7.31568 13.566 9.13902 16.5801 8.43896C19.5942 7.73891 21.4823 4.78056 20.7973 1.83131C20.1123 -1.11795 17.1136 -2.94128 14.0995 -2.24123C11.0854 -1.54118 9.19733 1.41717 9.88233 4.36642Z"
                      fill="#FC413D"
                    />
                  </g>
                  <g filter="url(#ag-f2)">
                    <path
                      d="M-8.05291 6.34512C-7.18736 9.38883 -3.28925 10.9473 0.653774 9.82598C4.5968 8.7047 7.09158 5.32829 6.22603 2.28458C5.36048 -0.759142 1.46236 -2.31758 -2.48066 -1.19629C-6.42368 -0.0750048 -8.91846 3.3014 -8.05291 6.34512Z"
                      fill="#00B95C"
                    />
                  </g>
                  <g filter="url(#ag-f3)">
                    <path
                      d="M-8.05291 6.34512C-7.18736 9.38883 -3.28925 10.9473 0.653774 9.82598C4.5968 8.7047 7.09158 5.32829 6.22603 2.28458C5.36048 -0.759142 1.46236 -2.31758 -2.48066 -1.19629C-6.42368 -0.0750048 -8.91846 3.3014 -8.05291 6.34512Z"
                      fill="#00B95C"
                    />
                  </g>
                  <g filter="url(#ag-f4)">
                    <path
                      d="M-4.92402 8.86746C-2.75421 11.0837 0.982691 10.9438 3.42257 8.55507C5.86246 6.1663 6.08139 2.43321 3.91158 0.216963C1.74177 -1.99928 -1.99513 -1.85942 -4.43501 0.529349C-6.87489 2.91812 -7.09383 6.65122 -4.92402 8.86746Z"
                      fill="#00B95C"
                    />
                  </g>
                  <g filter="url(#ag-f5)">
                    <path
                      d="M6.42819 17.2263C7.10197 20.1273 9.91278 21.953 12.7063 21.3042C15.4998 20.6553 17.2182 17.7777 16.5444 14.8767C15.8707 11.9757 13.0599 10.15 10.2663 10.7988C7.47281 11.4477 5.75441 14.3253 6.42819 17.2263Z"
                      fill="#3186FF"
                    />
                  </g>
                  <g filter="url(#ag-f6)">
                    <path
                      d="M1.66508 -5.94539C0.254213 -2.80254 1.7978 0.951609 5.11277 2.43973C8.42774 3.92785 12.2588 2.58642 13.6696 -0.556431C15.0805 -3.69928 13.5369 -7.45343 10.222 -8.94155C6.90699 -10.4297 3.07594 -9.08824 1.66508 -5.94539Z"
                      fill="#FBBC04"
                    />
                  </g>
                  <g filter="url(#ag-f7)">
                    <path
                      d="M-2.11428 24.3903C-5.52984 23.0496 0.307266 12.0177 1.75874 8.32038C3.21024 4.62304 7.15576 2.71272 10.5713 4.05357C13.9869 5.39442 18.0354 12.7796 16.5838 16.477C15.1323 20.1743 1.30129 25.7311 -2.11428 24.3903Z"
                      fill="#3186FF"
                    />
                  </g>
                  <g filter="url(#ag-f8)">
                    <path
                      d="M18.5814 10.6598C17.6669 11.727 15.2806 11.1828 13.2514 9.44417C11.2222 7.70556 10.3185 5.43097 11.2329 4.3637C12.1473 3.29646 14.5336 3.84069 16.5628 5.57928C18.592 7.31789 19.4958 9.59249 18.5814 10.6598Z"
                      fill="#749BFF"
                    />
                  </g>
                  <g filter="url(#ag-f9)">
                    <path
                      d="M11.7552 5.22715C15.5162 7.77124 19.8471 7.93838 21.4286 5.60045C23.0101 3.26253 21.2433 -0.695128 17.4823 -3.23922C13.7213 -5.78331 9.39044 -5.95044 7.80896 -3.61252C6.22747 -1.27459 7.99428 2.68306 11.7552 5.22715Z"
                      fill="#FC413D"
                    />
                  </g>
                  <g filter="url(#ag-f10)">
                    <path
                      d="M-0.592149 1.08896C-1.5239 3.33663 -1.21959 5.59799 0.0875457 6.13985C1.39468 6.68171 3.20966 5.29888 4.14141 3.05121C5.07316 0.803541 4.76885 -1.45782 3.46171 -1.99968C2.15458 -2.54154 0.339602 -1.15871 -0.592149 1.08896Z"
                      fill="#FFEE48"
                    />
                  </g>
                </g>
                <defs>
                  <filter
                    id="ag-f0"
                    x="-2.12817"
                    y="-8.35998"
                    width="12.8393"
                    height="11.383"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="0.722959"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f1"
                    x="2.75168"
                    y="-9.38089"
                    width="25.1763"
                    height="24.96"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="3.49513"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f2"
                    x="-14.1669"
                    y="-7.50196"
                    width="26.5068"
                    height="23.6338"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.97119"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f3"
                    x="-14.1669"
                    y="-7.50196"
                    width="26.5068"
                    height="23.6338"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.97119"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f4"
                    x="-12.3607"
                    y="-7.29981"
                    width="23.709"
                    height="23.6846"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.97119"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f5"
                    x="0.634962"
                    y="5.02095"
                    width="21.7027"
                    height="22.0616"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.82351"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f6"
                    x="-3.97547"
                    y="-14.6666"
                    width="23.2857"
                    height="22.8313"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.5589"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f7"
                    x="-7.7407"
                    y="-0.945408"
                    width="29.1982"
                    height="30.1105"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.2852"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f8"
                    x="6.78641"
                    y="-0.27231"
                    width="16.2415"
                    height="15.5681"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.04485"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f9"
                    x="3.77526"
                    y="-8.71693"
                    width="21.687"
                    height="19.4212"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="1.72712"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f10"
                    x="-5.40727"
                    y="-6.39238"
                    width="14.3639"
                    height="16.9254"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.1376"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                </defs>
              </svg>
            }
            installed={false}
            href="https://open-vsx.org/extension/envpilot/envpilot"
          />
        </div>

        <p className="mt-4 text-xs text-zinc-500">
          Available on{" "}
          <a
            href="https://open-vsx.org/extension/envpilot/envpilot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-zinc-300"
          >
            Open VSX Registry
          </a>{" "}
          &mdash; compatible with any VS Code fork including Cursor,
          Antigravity, VSCodium, and more.
        </p>
      </TerminalCard>

      <TerminalCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">CLI Tool</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Manage variables from your terminal
            </p>
          </div>
          <a
            href="https://www.npmjs.com/package/@envpilot/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            View on npm
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <CliInstallCommand />
      </TerminalCard>
    </div>
  );
}

function IntegrationCard({
  name,
  description,
  icon,
  installed,
  href,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  installed: boolean;
  href?: string;
}) {
  const button = installed ? (
    <TerminalButton variant="secondary">
      <Check className="h-3 w-3" /> Installed
    </TerminalButton>
  ) : href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
    >
      Install
      <ExternalLink className="h-3 w-3" />
    </a>
  ) : (
    <TerminalButton>Install</TerminalButton>
  );

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
      <div className="flex items-center gap-4">
        <div className="text-zinc-400">{icon}</div>
        <div>
          <p className="text-sm font-medium text-zinc-100">{name}</p>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
      {button}
    </div>
  );
}

function CliInstallCommand() {
  const [copied, setCopied] = useState(false);
  const command = "npm install -g @envpilot/cli";

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TerminalWindow title="terminal" className="mt-6">
      <div className="flex items-center justify-between p-4 font-mono text-sm">
        <code className="text-green-400">
          <span className="text-zinc-500">$</span> {command}
        </code>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </TerminalWindow>
  );
}

// ============================================================
// Security Settings
// ============================================================

interface Session {
  id: string;
  type: "cli" | "extension";
  deviceName: string;
  lastUsedAt: number | null;
  createdAt: number;
  expiresAt: number;
}

function SecuritySettings() {
  const [sessions, setSessions] = useState<{
    cli: Session[];
    extension: Session[];
  }>({ cli: [], extension: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/users/me/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch {
        // Leave empty
      } finally {
        setIsLoading(false);
      }
    }
    fetchSessions();
  }, []);

  async function handleRevokeAll() {
    setIsRevoking(true);
    setRevokeMessage(null);

    try {
      const res = await fetch("/api/users/me/sessions", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setSessions({ cli: [], extension: [] });
        setRevokeMessage(`Revoked ${data.revoked} session(s)`);
        setTimeout(() => setRevokeMessage(null), 3000);
      }
    } catch {
      setRevokeMessage("Failed to revoke sessions");
    } finally {
      setIsRevoking(false);
    }
  }

  const allSessions = [...sessions.cli, ...sessions.extension];

  return (
    <div className="space-y-6">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Browser Session
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Your current browser session
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
                <Shield className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  Current Session
                </p>
                <p className="text-xs text-zinc-500">
                  This device &middot; Active now
                </p>
              </div>
            </div>
            <TerminalBadge color="green">Active</TerminalBadge>
          </div>
        </div>
      </TerminalCard>

      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          CLI & Extension Sessions
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Active sessions from CLI and IDE extensions
        </p>

        <div className="mt-6 space-y-3">
          {isLoading ? (
            <>
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
                />
              ))}
            </>
          ) : allSessions.length === 0 ? (
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-6 text-center">
              <p className="text-sm text-zinc-500">
                No active CLI or extension sessions
              </p>
            </div>
          ) : (
            allSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700/50">
                    {session.type === "cli" ? (
                      <Terminal className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <Monitor className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {session.deviceName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {session.lastUsedAt
                        ? `Last used ${formatRelativeTime(session.lastUsedAt)}`
                        : `Created ${formatRelativeTime(session.createdAt)}`}
                    </p>
                  </div>
                </div>
                <TerminalBadge
                  color={session.type === "cli" ? "amber" : "green"}
                >
                  {session.type === "cli" ? "CLI" : "Extension"}
                </TerminalBadge>
              </div>
            ))
          )}
        </div>

        {allSessions.length > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <TerminalButton
              variant="danger"
              onClick={handleRevokeAll}
              disabled={isRevoking}
            >
              {isRevoking ? "Revoking..." : "Revoke All Sessions"}
            </TerminalButton>
            {revokeMessage && (
              <p className="text-sm text-green-400">{revokeMessage}</p>
            )}
          </div>
        )}
      </TerminalCard>
    </div>
  );
}

// ============================================================
// Customization Settings (Keyboard Shortcuts)
// ============================================================

const shortcutCategories = [
  { key: "navigation" as const, label: "Navigation" },
  { key: "actions" as const, label: "Actions" },
  { key: "selection" as const, label: "Selection" },
];

function CustomizationSettings() {
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const updateBinding = useKeyboardStore((s) => s.updateBinding);
  const removeBinding = useKeyboardStore((s) => s.removeBinding);
  const resetAllBindings = useKeyboardStore((s) => s.resetAllBindings);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [isRecordingSequence, setIsRecordingSequence] = useState(false);
  const [sequenceStep, setSequenceStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const effectiveShortcuts = getEffectiveShortcuts(customBindings);
  const hasCustomBindings = Object.keys(customBindings).length > 0;

  function startEditing(shortcutId: string) {
    setEditingId(shortcutId);
    setRecordedKeys([]);
    setIsRecordingSequence(false);
    setSequenceStep(0);
    setError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setRecordedKeys([]);
    setIsRecordingSequence(false);
    setSequenceStep(0);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!editingId) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    if (key === "Escape") {
      cancelEditing();
      return;
    }

    // Ignore standalone modifier keys
    if (["Control", "Shift", "Alt", "Meta"].includes(key)) return;

    const parts: string[] = [];
    if (e.metaKey || e.ctrlKey) parts.push("Mod");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    parts.push(key.length === 1 ? key.toUpperCase() : key);

    const binding = parts.join("+");

    if (isRecordingSequence && sequenceStep === 1) {
      // Second key of sequence
      const fullBinding = `${recordedKeys[0]} then ${binding}`;
      const validation = validateBinding(
        customBindings,
        editingId,
        fullBinding
      );
      if (!validation.valid) {
        setError(validation.reason ?? "Invalid binding");
        return;
      }
      saveBinding(editingId, fullBinding);
      return;
    }

    // Single key press — check if it's a simple letter (potential sequence start)
    if (
      parts.length === 1 &&
      key.length === 1 &&
      /^[A-Z]$/i.test(key) &&
      !isRecordingSequence
    ) {
      // Start sequence recording
      setIsRecordingSequence(true);
      setSequenceStep(1);
      setRecordedKeys([binding]);
      return;
    }

    // Regular single shortcut
    const validation = validateBinding(customBindings, editingId, binding);
    if (!validation.valid) {
      setError(validation.reason ?? "Invalid binding");
      return;
    }
    saveBinding(editingId, binding);
  }

  async function saveBinding(shortcutId: string, binding: string) {
    setIsSaving(true);
    const newBindings = { ...customBindings, [shortcutId]: binding };
    updateBinding(shortcutId, binding);

    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyboardShortcuts: newBindings }),
      });
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      // Revert on error
      removeBinding(shortcutId);
    } finally {
      setIsSaving(false);
      setEditingId(null);
      setRecordedKeys([]);
      setIsRecordingSequence(false);
      setSequenceStep(0);
      setError(null);
    }
  }

  async function handleRemoveBinding(shortcutId: string) {
    removeBinding(shortcutId);
    const { [shortcutId]: _, ...rest } = customBindings;
    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyboardShortcuts: rest }),
      });
    } catch {
      // Revert
      updateBinding(shortcutId, customBindings[shortcutId]);
    }
  }

  async function handleResetAll() {
    resetAllBindings();
    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyboardShortcuts: {} }),
      });
      setSaveMessage("All shortcuts reset to defaults");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      // Silently fail
    }
  }

  return (
    <div className="space-y-6">
      <TerminalCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10">
              <Keyboard className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">
                Keyboard Shortcuts
              </h2>
              <p className="text-sm text-zinc-500">
                Customize shortcuts to match your workflow
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saveMessage && (
              <span className="text-xs text-green-400">{saveMessage}</span>
            )}
            {hasCustomBindings && (
              <TerminalButton
                variant="secondary"
                onClick={handleResetAll}
                disabled={isSaving}
              >
                <RotateCcw className="h-3 w-3" />
                Reset All
              </TerminalButton>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {shortcutCategories.map((category) => {
            const items = Object.entries(effectiveShortcuts).filter(
              ([, def]) => def.category === category.key
            );
            if (items.length === 0) return null;

            return (
              <div key={category.key}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {category.label}
                </h3>
                <div className="space-y-1">
                  {items.map(([id, def]) => {
                    const isEditing = editingId === id;
                    const isCustomized = id in customBindings;

                    return (
                      <div
                        key={id}
                        className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                          isEditing
                            ? "border-purple-500/50 bg-purple-500/5"
                            : "border-zinc-700/50 bg-zinc-800/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-zinc-300">
                            {def.description}
                          </span>
                          {isCustomized && !isEditing && (
                            <span className="rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                              custom
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <div
                              className="flex items-center gap-2"
                              onKeyDown={handleKeyDown}
                              tabIndex={0}
                              autoFocus
                            >
                              <div className="flex items-center rounded border border-purple-500/30 bg-zinc-900 px-3 py-1.5">
                                {isRecordingSequence && sequenceStep === 1 ? (
                                  <span className="font-mono text-xs text-amber-400">
                                    {recordedKeys[0]} then ...
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs text-zinc-500">
                                    Press keys...
                                  </span>
                                )}
                              </div>
                              {error && (
                                <span className="text-xs text-red-400">
                                  {error}
                                </span>
                              )}
                              <button
                                onClick={cancelEditing}
                                className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <ShortcutKeyDisplay keys={def.keys} />
                              <button
                                onClick={() => startEditing(id)}
                                className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
                                title="Edit shortcut"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {isCustomized && (
                                <button
                                  onClick={() => handleRemoveBinding(id)}
                                  className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-amber-400"
                                  title="Reset to default"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
          <p className="text-xs text-zinc-500">
            Click the pencil icon to edit a shortcut. Press a key combination to
            set it, or press a single letter followed by another key for a
            sequence (e.g., G then P). Press{" "}
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            to cancel. Your shortcuts sync across all your devices.
          </p>
        </div>
      </TerminalCard>
    </div>
  );
}

function ShortcutKeyDisplay({ keys }: { keys: string }) {
  const isSequence = keys.includes(" then ");

  if (isSequence) {
    return (
      <div className="flex items-center gap-1">
        {keys.split(" then ").map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-zinc-600">then</span>}
            <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
              {k.trim()}
            </kbd>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {keys.split("+").map((key, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-zinc-600">+</span>}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
            {key.trim() === "Mod"
              ? typeof navigator !== "undefined" &&
                /Mac/.test(navigator.userAgent)
                ? "\u2318"
                : "Ctrl"
              : key.trim() === "Shift"
                ? "\u21E7"
                : key.trim()}
          </kbd>
        </span>
      ))}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ============================================================
// Billing Settings
// ============================================================

const CANCEL_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "switched_service", label: "Switched to another service" },
  { value: "unused", label: "Not using it enough" },
  { value: "customer_service", label: "Customer service issues" },
  { value: "low_quality", label: "Quality did not meet expectations" },
  { value: "too_complex", label: "Too complex to use" },
  { value: "other", label: "Other" },
];

function BillingSettings({
  organizationId,
  organizationSlug,
  alreadyProNotice,
}: {
  organizationId: string | undefined;
  organizationSlug: string | null | undefined;
  alreadyProNotice: boolean;
}) {
  const { data: subscription, isLoading } = useSubscription(organizationId);
  const portalMutation = useCreatePortalSession();
  const paymentsEnabled = usePaymentsEnabled();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelComment, setCancelComment] = useState("");
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function getStatusColor(status: string): "green" | "amber" | "red" {
    switch (status) {
      case "active":
        return "green";
      case "canceled":
      case "canceling":
        return "amber";
      case "past_due":
      case "revoked":
      case "unpaid":
        return "red";
      default:
        return "amber";
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case "active":
        return "Active";
      case "canceled":
        return "Canceled";
      case "revoked":
        return "Expired";
      case "past_due":
        return "Past Due";
      case "trialing":
        return "Trial";
      case "unpaid":
        return "Unpaid";
      case "incomplete":
        return "Incomplete";
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  async function handleManageBilling() {
    if (!organizationId) return;
    try {
      const data = await portalMutation.mutateAsync({ organizationId });
      if (data.portalUrl) window.open(data.portalUrl, "_blank");
    } catch {
      // Error is handled by mutation state
    }
  }

  async function handleConfirmCancel() {
    if (!organizationId) return;
    // Feedback is required before a cancellation goes through — the reason
    // lands on the Polar subscription and is what the team reviews.
    if (!cancelReason) {
      setCancelMessage({
        type: "error",
        text: "Please select a reason for canceling — this feedback is required.",
      });
      return;
    }
    setIsCanceling(true);
    setCancelMessage(null);

    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          reason: cancelReason,
          comment: cancelComment || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel subscription");
      }

      setCancelMessage({
        type: "success",
        text: "Subscription cancellation scheduled. Your access continues until the end of the current billing period.",
      });
      setShowCancelConfirm(false);
      setCancelReason("");
      setCancelComment("");
    } catch (err) {
      setCancelMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to cancel subscription",
      });
    } finally {
      setIsCanceling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <TerminalCard>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
              />
            ))}
          </div>
        </TerminalCard>
      </div>
    );
  }

  const sub = subscription?.subscription;
  const hasBillingCustomer = subscription?.hasBillingCustomer ?? false;
  const isActive = sub?.status === "active";
  const isRevoked = sub?.status === "revoked" || sub?.status === "canceled";
  const isCancelingAtEnd = sub?.cancelAtPeriodEnd ?? false;

  return (
    <div className="space-y-6">
      {alreadyProNotice && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-300">
          <Check className="h-4 w-4 shrink-0" />
          You&apos;re already on the Pro plan. Your subscription is active.
        </div>
      )}

      {/* Subscription Details */}
      <TerminalCard>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
            <CreditCard className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Subscription
            </h2>
            <p className="text-sm text-zinc-500">
              Your current plan and billing details
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* Plan & Status */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-100">Plan</span>
              <TierBadge tier={subscription?.tier ?? "free"} />
            </div>
            {sub && (
              <TerminalBadge color={getStatusColor(sub.status)}>
                {getStatusLabel(sub.status)}
              </TerminalBadge>
            )}
            {!sub && <TerminalBadge color="green">Free</TerminalBadge>}
          </div>

          {sub ? (
            <>
              {/* Last/Current Period */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm text-zinc-300">
                    {isRevoked ? "Last billing period" : "Current period"}
                  </span>
                </div>
                <span className="text-sm text-zinc-400">
                  {formatDate(sub.currentPeriodStart)} &mdash;{" "}
                  {formatDate(sub.currentPeriodEnd)}
                </span>
              </div>

              {/* Status-specific notices */}
              {isRevoked ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="text-sm text-red-300">
                      Your subscription has ended. You are now on the Free plan.
                    </span>
                  </div>
                  <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4 text-center">
                    <p className="text-sm text-zinc-400 mb-3">
                      {paymentsEnabled
                        ? "Resubscribe to unlock Pro features again."
                        : "Subscriptions are currently unavailable."}
                    </p>
                    {paymentsEnabled && (
                      <button
                        onClick={() => {
                          window.location.href = "/api/checkout?tier=pro";
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
                      >
                        Resubscribe to Pro
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ) : isCancelingAtEnd ? (
                <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-sm text-amber-300">
                    Cancels at end of period ({formatDate(sub.currentPeriodEnd)}
                    ). You retain Pro access until then.
                  </span>
                </div>
              ) : isActive ? (
                <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
                  <div className="flex items-center gap-3">
                    <Receipt className="h-4 w-4 text-zinc-400" />
                    <span className="text-sm text-zinc-300">
                      Next billing date
                    </span>
                  </div>
                  <span className="text-sm text-zinc-400">
                    {formatDate(sub.currentPeriodEnd)}
                  </span>
                </div>
              ) : sub.status === "past_due" ? (
                <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-sm text-red-300">
                    Payment failed. Please update your payment method to avoid
                    losing access.
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-6 text-center">
              <p className="text-sm text-zinc-400">
                {paymentsEnabled
                  ? "You're on the Free plan. Upgrade to unlock more features."
                  : "You're on the Free plan."}
              </p>
              {paymentsEnabled && (
                <button
                  onClick={() => {
                    window.location.href = "/api/checkout?tier=pro";
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
                >
                  Upgrade to Pro
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </TerminalCard>

      {/* Cancel Message */}
      {cancelMessage && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            cancelMessage.type === "success"
              ? "border-green-500/30 bg-green-500/5 text-green-400"
              : "border-red-500/30 bg-red-500/5 text-red-400"
          }`}
        >
          {cancelMessage.text}
        </div>
      )}

      {/* Actions */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Billing Actions
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your payment methods, invoices, and subscription
        </p>

        <div className="mt-6 space-y-3">
          {hasBillingCustomer && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">
                    Manage Billing
                  </p>
                  <p className="text-xs text-zinc-500">
                    Update payment methods and billing details
                  </p>
                </div>
                <TerminalButton
                  onClick={handleManageBilling}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? "Opening..." : "Open Portal"}
                  {!portalMutation.isPending && (
                    <ExternalLink className="ml-1.5 h-3 w-3" />
                  )}
                </TerminalButton>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
                <div>
                  <p className="text-sm font-medium text-zinc-100">
                    View Invoices & Receipts
                  </p>
                  <p className="text-xs text-zinc-500">
                    Access your billing history and download receipts
                  </p>
                </div>
                <TerminalButton
                  variant="secondary"
                  onClick={handleManageBilling}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? "Opening..." : "View Invoices"}
                  {!portalMutation.isPending && (
                    <Receipt className="ml-1.5 h-3 w-3" />
                  )}
                </TerminalButton>
              </div>
            </>
          )}

          {isActive && !isCancelingAtEnd && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  Cancel Subscription
                </p>
                <p className="text-xs text-zinc-500">
                  Cancel at the end of your current billing period
                </p>
              </div>
              <TerminalButton
                variant="danger"
                onClick={() => setShowCancelConfirm(true)}
              >
                Cancel Plan
              </TerminalButton>
            </div>
          )}

          {!hasBillingCustomer && !isActive && (
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-6 text-center">
              <p className="text-sm text-zinc-500">
                No billing actions available on the Free plan.
              </p>
            </div>
          )}
        </div>

        {portalMutation.isError && (
          <p className="mt-3 text-sm text-red-400">
            {portalMutation.error instanceof Error
              ? portalMutation.error.message
              : "Failed to open billing portal"}
          </p>
        )}
      </TerminalCard>

      {/* Cancel Confirmation */}
      {showCancelConfirm && sub && (
        <TerminalCard>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">
              Confirm Cancellation
            </h2>
          </div>

          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <ul className="space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-400">&bull;</span>
                Your Pro access continues until{" "}
                {formatDate(sub.currentPeriodEnd)}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-400">&bull;</span>
                After that, a 7-day grace period begins
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-400">&bull;</span>
                No refund for the current billing period
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-400">&bull;</span>
                Your data is never deleted
              </li>
            </ul>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="cancelReason"
                className="block text-sm font-medium text-zinc-300"
              >
                Reason for canceling <span className="text-red-400">*</span>
              </label>
              <select
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select a reason (required)</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cancelComment"
                className="block text-sm font-medium text-zinc-300"
              >
                Additional feedback (optional)
              </label>
              <textarea
                id="cancelComment"
                value={cancelComment}
                onChange={(e) => setCancelComment(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder="Tell us how we can improve..."
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <TerminalButton
              variant="secondary"
              onClick={() => {
                setShowCancelConfirm(false);
                setCancelReason("");
                setCancelComment("");
              }}
              disabled={isCanceling}
            >
              Go Back
            </TerminalButton>
            <TerminalButton
              variant="danger"
              onClick={handleConfirmCancel}
              disabled={isCanceling || !cancelReason}
              title={
                !cancelReason ? "Select a cancellation reason first" : undefined
              }
            >
              {isCanceling ? "Canceling..." : "Confirm Cancellation"}
            </TerminalButton>
          </div>
        </TerminalCard>
      )}

      {/* Quick Links */}
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">Quick Links</h2>
        <div className="mt-4 space-y-2">
          <Link
            href="/faq#plans-billing"
            className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
            Billing FAQ
          </Link>
          <Link
            href="/terms#billing"
            className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
            Terms of Service &mdash; Billing
          </Link>
          <Link
            href="/privacy"
            className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
            Privacy Policy
          </Link>
        </div>
      </TerminalCard>
    </div>
  );
}
