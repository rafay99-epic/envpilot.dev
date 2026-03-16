"use client";

import { useState } from "react";
import { useAuthContext } from "@/components/auth";
import {
  TerminalWindow,
  TerminalCard,
  TerminalInput,
  TerminalButton,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { Plus, Shield, Check, ExternalLink, Copy } from "lucide-react";

type SettingsTab = "general" | "integrations" | "security";

export default function SettingsPage() {
  const { user } = useAuthContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "integrations", label: "Integrations" },
    { id: "security", label: "Security" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Settings</h1>
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
