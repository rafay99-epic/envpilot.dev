"use client";

import { useState } from "react";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { Plus, Shield, Check } from "lucide-react";

type SettingsTab = "general" | "organization" | "integrations" | "security";

export default function SettingsPage() {
  const { user, organization, hasPermission } = useAuthContext();
  const canManageOrg = hasPermission(PERMISSIONS.ORG_ADMIN);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; label: string; requiresAdmin?: boolean }[] = [
    { id: "general", label: "General" },
    { id: "organization", label: "Organization", requiresAdmin: true },
    { id: "integrations", label: "Integrations" },
    { id: "security", label: "Security" },
  ];

  const filteredTabs = tabs.filter((tab) => !tab.requiresAdmin || canManageOrg);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your account and organization preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex space-x-6">
          {filteredTabs.map((tab) => (
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
        {activeTab === "organization" && (
          <OrganizationSettings organization={organization} />
        )}
        {activeTab === "integrations" && <IntegrationsSettings />}
        {activeTab === "security" && <SecuritySettings />}
      </div>
    </div>
  );
}

function GeneralSettings({
  user,
}: {
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}) {
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");

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

        <div className="mt-6 flex justify-end">
          <TerminalButton>Save Changes</TerminalButton>
        </div>
      </TerminalCard>
    </div>
  );
}

function OrganizationSettings({
  organization,
}: {
  organization: { name: string; slug: string | null } | null;
}) {
  const [name, setName] = useState(organization?.name || "");
  const [slug, setSlug] = useState(organization?.slug || "");

  return (
    <div className="space-y-6">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Organization Details
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your organization settings
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="orgName"
              className="block text-sm font-medium text-zinc-300"
            >
              Organization Name
            </label>
            <TerminalInput
              type="text"
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="orgSlug"
              className="block text-sm font-medium text-zinc-300"
            >
              Organization URL
            </label>
            <div className="mt-1 flex rounded-lg border border-zinc-700 overflow-hidden">
              <span className="flex items-center border-r border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-500">
                envpilot.dev/
              </span>
              <input
                type="text"
                id="orgSlug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <TerminalButton>Save Changes</TerminalButton>
        </div>
      </TerminalCard>

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-500/30 bg-zinc-900/90 p-6">
        <h2 className="text-base font-semibold text-red-400">Danger Zone</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Irreversible actions for your organization
        </p>

        <div className="mt-6 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div>
            <p className="text-sm font-medium text-zinc-100">
              Delete Organization
            </p>
            <p className="text-sm text-zinc-500">
              Permanently delete this organization and all its data
            </p>
          </div>
          <TerminalButton variant="danger">Delete</TerminalButton>
        </div>
      </div>
    </div>
  );
}

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
        <h2 className="text-base font-semibold text-zinc-100">CLI Tool</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage variables from your terminal
        </p>

        <TerminalWindow title="terminal" className="mt-6">
          <div className="p-4 font-mono text-sm">
            <code className="text-green-400">
              <span className="text-zinc-500">$</span> npm install -g
              @envpilot/cli
            </code>
          </div>
        </TerminalWindow>
      </TerminalCard>
    </div>
  );
}

function IntegrationCard({
  name,
  description,
  icon,
  installed,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  installed: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-700/50 bg-zinc-800/50 p-4">
      <div className="flex items-center gap-4">
        <div className="text-zinc-400">{icon}</div>
        <div>
          <p className="text-sm font-medium text-zinc-100">{name}</p>
          <p className="text-xs text-zinc-500">{description}</p>
        </div>
      </div>
      <TerminalButton variant={installed ? "secondary" : "primary"}>
        {installed ? (
          <>
            <Check className="h-3 w-3" /> Installed
          </>
        ) : (
          "Install"
        )}
      </TerminalButton>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">
          Active Sessions
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your active sessions across devices
        </p>

        <div className="mt-6 space-y-3">
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
                  This device &middot; Just now
                </p>
              </div>
            </div>
            <TerminalBadge color="green">Active</TerminalBadge>
          </div>
        </div>

        <div className="mt-6">
          <TerminalButton variant="danger">
            Sign Out All Other Sessions
          </TerminalButton>
        </div>
      </TerminalCard>

      <TerminalCard>
        <h2 className="text-base font-semibold text-zinc-100">Access Tokens</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage API tokens for CLI and extensions
        </p>

        <div className="mt-6">
          <TerminalButton>
            <Plus className="h-4 w-4" />
            Generate New Token
          </TerminalButton>
        </div>
      </TerminalCard>
    </div>
  );
}
