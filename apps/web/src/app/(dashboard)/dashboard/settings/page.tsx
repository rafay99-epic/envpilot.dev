"use client";

import { useState, useEffect } from "react";
import { useAuthContext } from "@/components/auth";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import {
  Shield,
  Check,
  ExternalLink,
  Copy,
  Lock,
  Terminal,
  Monitor,
  Variable,
  Users,
  KeyRound,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

type SettingsTab = "general" | "notifications" | "integrations" | "security";

export default function SettingsPage() {
  const { user } = useAuthContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "notifications", label: "Notifications" },
    { id: "integrations", label: "Integrations" },
    { id: "security", label: "Security" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Account Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your account preferences
        </p>
      </div>

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
}

function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    variableChanges: true,
    memberUpdates: true,
    accessRequests: true,
    securityAlerts: true,
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
              <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-700 text-xs font-bold text-zinc-300">
                C
              </div>
            }
            installed={false}
          />
        </div>
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
