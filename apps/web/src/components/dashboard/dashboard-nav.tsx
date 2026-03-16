"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@/components/auth";
import { useAuthContext } from "@/components/auth";
import {
  LayoutDashboard,
  FolderOpen,
  Key,
  Users,
  ClipboardList,
  Gauge,
  Settings,
  Menu,
  X,
  Terminal,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTierStoreSync } from "@/hooks/useTierStore";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function NavLink({
  item,
  onClick,
  collapsed,
}: {
  item: NavItem;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  // For project base URLs (e.g. /dashboard/projects/slug), use exact match
  // to avoid highlighting "Variables" when on /settings or /members
  const isProjectBase = /^\/dashboard\/projects\/[^/]+$/.test(item.href);
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : isProjectBase
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        collapsed ? "justify-center" : ""
      } ${
        isActive
          ? "border-l-2 border-green-400 bg-green-500/10 text-green-400"
          : "border-l-2 border-transparent text-zinc-500 hover:bg-green-500/5 hover:text-green-400"
      }`}
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export function DashboardNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { organization } = useAuthContext();

  // Hydrate Zustand tier store from Convex — one subscription for all dashboard pages
  useTierStoreSync();

  // Detect project context from pathname
  const projectSlugMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)/);
  const projectSlug =
    projectSlugMatch?.[1] && projectSlugMatch[1] !== "new"
      ? projectSlugMatch[1]
      : null;
  const isProjectContext = !!projectSlug;

  // Org-level settings href
  const orgSettingsHref = organization?.slug
    ? `/organizations/${organization.slug}/settings`
    : "/dashboard/settings";

  // Org-level nav items
  const orgNavItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: "/dashboard/projects",
      label: "Projects",
      icon: <FolderOpen className="h-4 w-4" />,
    },
    {
      href: "/dashboard/team",
      label: "Team",
      icon: <Users className="h-4 w-4" />,
    },
    {
      href: "/dashboard/audit",
      label: "Audit Logs",
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      href: "/dashboard/usage",
      label: "Usage & Plan",
      icon: <Gauge className="h-4 w-4" />,
    },
    {
      href: orgSettingsHref,
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  // Project-level nav items
  const projectNavItems: NavItem[] = projectSlug
    ? [
        {
          href: `/dashboard/projects/${projectSlug}`,
          label: "Variables",
          icon: <Key className="h-4 w-4" />,
        },
        {
          href: `/dashboard/projects/${projectSlug}/members`,
          label: "Members",
          icon: <Users className="h-4 w-4" />,
        },
        {
          href: `/dashboard/projects/${projectSlug}/settings`,
          label: "Settings",
          icon: <Settings className="h-4 w-4" />,
        },
      ]
    : [];

  const activeNavItems = isProjectContext ? projectNavItems : orgNavItems;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`relative z-20 hidden shrink-0 border-r border-zinc-800 bg-[#0f172a] transition-all duration-200 md:block ${
          isCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-zinc-800 px-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 font-mono"
            >
              <Terminal className="h-5 w-5 shrink-0 text-green-400" />
              {!isCollapsed && (
                <span className="text-sm font-semibold text-zinc-100">
                  <span className="text-green-400">$</span> envpilot
                </span>
              )}
            </Link>
          </div>

          {/* Organization Switcher */}
          <div
            className={`border-b border-zinc-800 ${isCollapsed ? "p-2" : "p-3"}`}
          >
            <OrganizationSwitcher
              currentOrgId={organization?.id ?? undefined}
              collapsed={isCollapsed}
            />
          </div>

          {/* Search Trigger */}
          <div
            className={`border-b border-zinc-800 ${isCollapsed ? "p-2" : "px-3 py-2"}`}
          >
            <button
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
              }
              title={isCollapsed ? "Search (⌘K)" : undefined}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 ${
                isCollapsed ? "justify-center" : "gap-3"
              }`}
            >
              <Search className="h-4 w-4 shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">Search...</span>
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                    ⌘K
                  </kbd>
                </>
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className={`flex-1 space-y-1 ${isCollapsed ? "p-2" : "p-3"}`}>
            {activeNavItems.map((item) => (
              <NavLink
                key={item.href + item.label}
                item={item}
                collapsed={isCollapsed}
              />
            ))}
          </nav>

          {/* Collapse Toggle */}
          <div className="border-t border-zinc-800 p-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex w-full items-center justify-center rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* User Menu */}
          <div className="border-t border-zinc-800 p-3">
            <UserButton collapsed={isCollapsed} />
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-zinc-800 bg-[#0f172a] px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-mono">
          <Terminal className="h-5 w-5 text-green-400" />
          <span className="text-sm font-semibold text-zinc-100">
            <span className="text-green-400">$</span> envpilot
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <UserButton collapsed />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-60 bg-[#0f172a]">
            <div className="flex h-full flex-col pt-14">
              {/* Organization Switcher */}
              <div className="border-b border-zinc-800 p-3">
                <OrganizationSwitcher
                  currentOrgId={organization?.id ?? undefined}
                />
              </div>

              {/* Navigation */}
              <nav className="flex-1 space-y-1 p-3">
                {activeNavItems.map((item) => (
                  <NavLink
                    key={item.href + item.label}
                    item={item}
                    onClick={() => setIsMobileMenuOpen(false)}
                  />
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Mobile spacer */}
      <div className="h-14 md:hidden" />
    </>
  );
}
