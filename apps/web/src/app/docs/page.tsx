"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Terminal,
  Monitor,
  Puzzle,
  ArrowLeft,
  ChevronRight,
  Shield,
  Users,
  FileText,
  Download,
  LogIn,
  FolderSync,
  ArrowUpFromLine,
  List,
  Settings,
  RefreshCw,
  Globe,
  Lock,
  Eye,
  GitBranch,
  Layers,
} from "lucide-react";

type SectionId =
  | "getting-started"
  | "cli"
  | "extension"
  | "web-portal"
  | "security"
  | "rbac";

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "getting-started", label: "Getting Started", icon: <ChevronRight className="h-4 w-4" /> },
  { id: "cli", label: "CLI Tool", icon: <Terminal className="h-4 w-4" /> },
  { id: "extension", label: "VS Code Extension", icon: <Puzzle className="h-4 w-4" /> },
  { id: "web-portal", label: "Web Dashboard", icon: <Monitor className="h-4 w-4" /> },
  { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  { id: "rbac", label: "Roles & Permissions", icon: <Users className="h-4 w-4" /> },
];

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80">
      {title && (
        <div className="border-b border-zinc-800 bg-zinc-800/50 px-4 py-2">
          <span className="text-xs text-zinc-400">{title}</span>
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-zinc-300">
        {children}
      </pre>
    </div>
  );
}

function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <tr className="border-b border-zinc-800/50">
      <td className="w-[45%] px-4 py-3 align-top font-mono text-sm text-emerald-400">{cmd}</td>
      <td className="px-4 py-3 align-top text-sm text-zinc-400">{desc}</td>
    </tr>
  );
}

function FlagRow({ flag, desc, def }: { flag: string; desc: string; def?: string }) {
  return (
    <tr className="border-b border-zinc-800/50">
      <td className="py-2 pr-4 font-mono text-xs text-amber-400">{flag}</td>
      <td className="py-2 text-sm text-zinc-400">
        {desc}
        {def && <span className="ml-2 text-xs text-zinc-600">(default: {def})</span>}
      </td>
    </tr>
  );
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-white">{title}</h2>
    </div>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState<SectionId>("getting-started");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-semibold text-white">Documentation</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-xs text-zinc-500 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/sign-up" className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-200 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-0 px-6 py-8 md:gap-8">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-24 space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active === s.id
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile section selector */}
        <div className="mb-6 flex gap-2 overflow-x-auto md:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
                active === s.id
                  ? "bg-white text-zinc-900"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {/* Getting Started */}
          {active === "getting-started" && (
            <div className="space-y-8">
              <SectionHeading icon={<ChevronRight className="h-5 w-5" />} title="Getting Started" />

              <p className="text-lg text-zinc-400">
                Envpilot helps your team manage environment variables securely. Instead of
                sharing <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-zinc-300">.env</code> files
                over Slack or email, secrets are stored in an encrypted vault with granular
                access control.
              </p>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Quick Setup</h3>
                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-sm text-zinc-400">1. Install the CLI</p>
                    <CodeBlock>npm install -g @envpilot/cli</CodeBlock>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-zinc-400">2. Authenticate via browser-based SSO</p>
                    <CodeBlock>envpilot login</CodeBlock>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-zinc-400">3. Initialize your project directory</p>
                    <CodeBlock>envpilot init</CodeBlock>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-zinc-400">4. Pull your environment variables</p>
                    <CodeBlock>envpilot pull --env development</CodeBlock>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="font-semibold text-white">Three ways to access your secrets</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div className="flex items-start gap-3">
                    <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium text-white">CLI Tool</p>
                      <p className="mt-1 text-xs text-zinc-500">Pull, push, and manage from your terminal</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Puzzle className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
                    <div>
                      <p className="text-sm font-medium text-white">VS Code Extension</p>
                      <p className="mt-1 text-xs text-zinc-500">Real-time sync inside your editor</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-purple-400" />
                    <div>
                      <p className="text-sm font-medium text-white">Web Dashboard</p>
                      <p className="mt-1 text-xs text-zinc-500">Full management UI in the browser</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CLI */}
          {active === "cli" && (
            <div className="space-y-8">
              <SectionHeading icon={<Terminal className="h-5 w-5" />} title="CLI Tool" />

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Installation</h3>
                <CodeBlock>npm install -g @envpilot/cli</CodeBlock>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Commands</h3>

                {/* login */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <LogIn className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot login</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    Authenticate with Envpilot via browser-based SSO. Opens your browser automatically.
                  </p>
                  <table className="mt-3 w-full">
                    <tbody>
                      <FlagRow flag="--api-url <url>" desc="Custom API URL" />
                      <FlagRow flag="--no-browser" desc="Do not auto-open browser" />
                    </tbody>
                  </table>
                </div>

                {/* init */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <FolderSync className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot init</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    Initialize Envpilot in the current directory. Links your project and environment,
                    creates a <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">.envpilot</code> config
                    file, and adds <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">.env</code> to
                    your <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">.gitignore</code>.
                  </p>
                  <table className="mt-3 w-full">
                    <tbody>
                      <FlagRow flag="-o, --organization <id>" desc="Organization ID" />
                      <FlagRow flag="-p, --project <id>" desc="Project ID" />
                      <FlagRow flag="-e, --environment <env>" desc="Default environment" />
                      <FlagRow flag="-f, --force" desc="Overwrite existing configuration" />
                    </tbody>
                  </table>
                </div>

                {/* pull */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot pull</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    Download environment variables to a local <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">.env</code> file.
                    Shows a diff of changes before writing.
                  </p>
                  <table className="mt-3 w-full">
                    <tbody>
                      <FlagRow flag="-e, --env <environment>" desc="Target environment" def="from config" />
                      <FlagRow flag="-f, --file <path>" desc="Output file path" def=".env" />
                      <FlagRow flag="--force" desc="Overwrite without confirmation" />
                      <FlagRow flag="--format <format>" desc="Output format: env, json" def="env" />
                      <FlagRow flag="--dry-run" desc="Preview changes without writing" />
                    </tbody>
                  </table>
                </div>

                {/* push */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot push</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    Upload local <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">.env</code> file to
                    the cloud. Calculates a diff and asks for confirmation before pushing.
                  </p>
                  <table className="mt-3 w-full">
                    <tbody>
                      <FlagRow flag="-e, --env <environment>" desc="Target environment" />
                      <FlagRow flag="-f, --file <path>" desc="Input file path" def=".env" />
                      <FlagRow flag="--merge" desc="Merge with existing variables (default)" />
                      <FlagRow flag="--replace" desc="Replace all existing variables" />
                      <FlagRow flag="--dry-run" desc="Preview changes without pushing" />
                      <FlagRow flag="--force" desc="Skip confirmation prompt" />
                    </tbody>
                  </table>
                </div>

                {/* list */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <List className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot list [resource]</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    List organizations, projects, or variables. Values are masked by default.
                  </p>
                  <div className="mt-2 text-xs text-zinc-500">
                    Resources: <code className="text-zinc-400">projects</code> (default), <code className="text-zinc-400">organizations</code>, <code className="text-zinc-400">variables</code>
                  </div>
                  <table className="mt-3 w-full">
                    <tbody>
                      <FlagRow flag="-o, --organization <id>" desc="Organization ID" />
                      <FlagRow flag="-p, --project <id>" desc="Project ID" />
                      <FlagRow flag="-e, --env <environment>" desc="Environment filter" />
                      <FlagRow flag="--show-values" desc="Show actual values (masked by default)" />
                      <FlagRow flag="--json" desc="Output as JSON" />
                    </tbody>
                  </table>
                </div>

                {/* switch */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot switch [target]</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    Switch active project, organization, or environment. Without arguments, opens interactive mode.
                  </p>
                  <table className="mt-3 w-full">
                    <tbody>
                      <FlagRow flag="-o, --organization <id>" desc="Switch organization" />
                      <FlagRow flag="-p, --project <id>" desc="Switch project" />
                      <FlagRow flag="-e, --env <environment>" desc="Switch environment" />
                    </tbody>
                  </table>
                </div>

                {/* config */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot config [action]</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    View or manage CLI configuration.
                  </p>
                  <div className="mt-2 text-xs text-zinc-500">
                    Actions: <code className="text-zinc-400">list</code> (default), <code className="text-zinc-400">get</code>, <code className="text-zinc-400">set</code>, <code className="text-zinc-400">path</code>, <code className="text-zinc-400">reset</code>
                  </div>
                </div>

                {/* logout */}
                <div className="rounded-lg border border-zinc-800 p-5">
                  <div className="flex items-center gap-2">
                    <LogIn className="h-4 w-4 rotate-180 text-emerald-400" />
                    <h4 className="font-mono text-sm font-semibold text-white">envpilot logout</h4>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">
                    Revoke authentication and clear local credentials.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Extension */}
          {active === "extension" && (
            <div className="space-y-8">
              <SectionHeading icon={<Puzzle className="h-5 w-5" />} title="VS Code Extension" />

              <p className="text-lg text-zinc-400">
                The Envpilot VS Code extension provides real-time environment variable sync
                directly in your editor. It supports multi-directory linking, WebSocket-based
                live updates, and automatic file cleanup on access revocation.
              </p>

              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Installation</h3>
                <p className="text-sm text-zinc-400">
                  Search for <strong className="text-white">Envpilot</strong> in the VS Code
                  extension marketplace, or install from the Settings &rarr; Integrations page
                  in the web dashboard.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Commands</h3>
                <div className="overflow-hidden rounded-lg border border-zinc-800">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="w-[45%] px-4 py-2.5 text-left text-xs font-medium text-zinc-400">Command</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      <CommandRow cmd="Envpilot: Sign In" desc="Authenticate via browser-based OAuth" />
                      <CommandRow cmd="Envpilot: Sign Out" desc="Log out and clear local session" />
                      <CommandRow cmd="Envpilot: Link Project" desc="Link a project to the current workspace" />
                      <CommandRow cmd="Envpilot: Unlink Project" desc="Remove project link from workspace" />
                      <CommandRow cmd="Envpilot: Pull Variables" desc="Manually sync variables from cloud" />
                      <CommandRow cmd="Envpilot: Add Directory" desc="Add a directory to a linked project" />
                      <CommandRow cmd="Envpilot: Remove Directory" desc="Remove a directory from project sync" />
                      <CommandRow cmd="Envpilot: Select Environments" desc="Choose which environments to sync" />
                      <CommandRow cmd="Envpilot: Request Variable" desc="Submit a variable request (members)" />
                      <CommandRow cmd="Envpilot: Open Dashboard" desc="Open web dashboard in browser" />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Configuration</h3>
                <div className="overflow-hidden rounded-lg border border-zinc-800">
                  <table className="w-full table-fixed">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50">
                        <th className="w-[45%] px-4 py-2.5 text-left text-xs font-medium text-zinc-400">Setting</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-400">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      <CommandRow cmd="envpilot.autoSync" desc="Automatically sync on workspace open" />
                      <CommandRow cmd="envpilot.syncInterval" desc="Permission check interval (60-3600s)" />
                      <CommandRow cmd="envpilot.targetFile" desc="Default target file (e.g., .env.local)" />
                      <CommandRow cmd="envpilot.environment" desc="Default environment (development, staging, production)" />
                      <CommandRow cmd="envpilot.preventCopyOnRevoke" desc="Delete synced files when permissions are revoked" />
                      <CommandRow cmd="envpilot.defaultConflictResolution" desc="Strategy: prompt, overwrite, backup, merge, skip" />
                      <CommandRow cmd="envpilot.enableMultiDirectorySync" desc="Enable multi-directory linking" />
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="font-semibold text-white">Multi-Directory Sync</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Link multiple directories in the same workspace to different projects or environments.
                  Each directory syncs independently to its own <code className="rounded bg-zinc-800 px-1 text-xs text-zinc-300">.env</code> file.
                </p>
                <CodeBlock title="Example workspace structure">{`my-monorepo/
├── apps/api/.env          ← production
├── apps/web/.env.local    ← development
└── packages/sdk/.env      ← staging`}</CodeBlock>
              </div>
            </div>
          )}

          {/* Web Portal */}
          {active === "web-portal" && (
            <div className="space-y-8">
              <SectionHeading icon={<Monitor className="h-5 w-5" />} title="Web Dashboard" />

              <p className="text-lg text-zinc-400">
                The web dashboard is your central management interface for projects, variables,
                team members, and audit logs.
              </p>

              <div className="space-y-4">
                {[
                  {
                    icon: <Layers className="h-5 w-5 text-purple-400" />,
                    title: "Projects",
                    desc: "Create and manage projects. Each project can have multiple environments (development, staging, production) with their own set of variables.",
                  },
                  {
                    icon: <FileText className="h-5 w-5 text-blue-400" />,
                    title: "Variables",
                    desc: "View and manage all environment variables across projects. Filter by project, environment, or search by name. Variables are encrypted in WorkOS Vault — you see values only when you have permission.",
                  },
                  {
                    icon: <Users className="h-5 w-5 text-emerald-400" />,
                    title: "Team Management",
                    desc: "Invite team members, assign roles (Admin, Team Lead, Member), and manage per-variable permissions. Members can request access to variables; leads and admins approve.",
                  },
                  {
                    icon: <Eye className="h-5 w-5 text-amber-400" />,
                    title: "Audit Logs",
                    desc: "Full audit trail of every action — variable reads, writes, permission changes, authentication events, and more. Filter by action type, category, or date range. Export for compliance.",
                  },
                  {
                    icon: <Settings className="h-5 w-5 text-zinc-400" />,
                    title: "Settings",
                    desc: "Manage your profile, organization details, integrations (VS Code, Cursor, CLI), and security settings (active sessions, access tokens).",
                  },
                  {
                    icon: <GitBranch className="h-5 w-5 text-rose-400" />,
                    title: "Version History",
                    desc: "Track changes to every variable over time. Admins can roll back to previous versions per environment.",
                  },
                ].map((feature) => (
                  <div key={feature.title} className="flex gap-4 rounded-lg border border-zinc-800 p-5">
                    <div className="mt-0.5 shrink-0">{feature.icon}</div>
                    <div>
                      <h4 className="font-semibold text-white">{feature.title}</h4>
                      <p className="mt-1 text-sm text-zinc-400">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security */}
          {active === "security" && (
            <div className="space-y-8">
              <SectionHeading icon={<Shield className="h-5 w-5" />} title="Security" />

              <div className="space-y-6">
                {[
                  {
                    icon: <Lock className="h-5 w-5 text-emerald-400" />,
                    title: "AES-256 Encryption",
                    desc: "All secret values are encrypted using AES-256 via WorkOS Vault. The platform stores only vault reference IDs — never plaintext values. Each organization has cryptographic isolation through unique key derivation.",
                  },
                  {
                    icon: <Globe className="h-5 w-5 text-blue-400" />,
                    title: "Zero-Knowledge Architecture",
                    desc: "Envpilot cannot read your secrets. Vault references are resolved only when an authorized user requests them. Encryption and decryption happen within WorkOS Vault infrastructure.",
                  },
                  {
                    icon: <Eye className="h-5 w-5 text-amber-400" />,
                    title: "Comprehensive Audit Trail",
                    desc: "40+ action types capture reads, writes, permission changes, authentication attempts, and more. Each entry includes IP address, user agent, and geographic location. Export any time for SOC 2 compliance.",
                  },
                  {
                    icon: <Shield className="h-5 w-5 text-rose-400" />,
                    title: "Access Revocation",
                    desc: "Revoke access instantly from the web dashboard. The VS Code extension detects permission changes via WebSocket and automatically removes synced .env files within seconds.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
                    <div className="mt-0.5 shrink-0">{item.icon}</div>
                    <div>
                      <h4 className="font-semibold text-white">{item.title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RBAC */}
          {active === "rbac" && (
            <div className="space-y-8">
              <SectionHeading icon={<Users className="h-5 w-5" />} title="Roles & Permissions" />

              <p className="text-lg text-zinc-400">
                Envpilot uses a three-tier role-based access control system combined with
                per-variable permissions for fine-grained control.
              </p>

              <div className="space-y-4">
                {[
                  {
                    role: "Admin",
                    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
                    perms: [
                      "Full access to all projects and variables",
                      "Roll back variable versions",
                      "Manage all user permissions",
                      "Export audit logs for compliance",
                      "Delete organizations and projects",
                    ],
                  },
                  {
                    role: "Team Lead",
                    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                    perms: [
                      "Create and manage projects",
                      "Create and modify variables",
                      "Grant and revoke per-variable access",
                      "Approve member variable requests",
                      "View audit logs",
                    ],
                  },
                  {
                    role: "Member",
                    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                    perms: [
                      "Read-only access to assigned projects",
                      "Pull variables they have explicit access to",
                      "Request access to new variables",
                      "Submit new variables for approval",
                      "Cannot create variables directly",
                    ],
                  },
                ].map((r) => (
                  <div key={r.role} className="rounded-lg border border-zinc-800 p-5">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${r.color}`}>
                      {r.role}
                    </span>
                    <ul className="mt-4 space-y-2">
                      {r.perms.map((p) => (
                        <li key={p} className="flex items-start gap-2 text-sm text-zinc-400">
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="font-semibold text-white">Per-Variable Permissions</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Beyond roles, access can be granted on individual variables. Team Leads and
                  Admins can grant read or write access to specific variables, with optional
                  expiration dates. When a Member needs a variable they don&apos;t have access to,
                  they submit a request that must be approved.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
