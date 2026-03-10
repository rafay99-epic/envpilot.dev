"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { UserButton, OrganizationSwitcher } from "@/components/auth";
import { useAuthContext } from "@/components/auth";
import {
  LayoutDashboard,
  FolderOpen,
  Key,
  Users,
  ClipboardList,
  Settings,
  Menu,
  X,
  Terminal,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const navItems: NavItem[] = [
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
    href: "/dashboard/variables",
    label: "Variables",
    icon: <Key className="h-4 w-4" />,
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
    href: "/dashboard/settings",
    label: "Settings",
    icon: <Settings className="h-4 w-4" />,
  },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "border-l-2 border-green-400 bg-green-500/10 text-green-400"
          : "border-l-2 border-transparent text-zinc-500 hover:bg-green-500/5 hover:text-green-400"
      }`}
    >
      {item.icon}
      {item.label}
      {item.badge != null && item.badge > 0 && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-xs font-medium text-amber-400">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export function DashboardNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { organization } = useAuthContext();

  const orgRole = organization?.role;
  const canReview = orgRole === "admin" || orgRole === "team_lead";
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const stats = useQuery(
    api.dashboard.getStats,
    orgId ? { organizationId: orgId } : "skip"
  );
  const pendingCount =
    canReview && stats?.pendingRequests ? stats.pendingRequests.total : 0;

  const navItemsWithBadges = useMemo(
    () =>
      navItems.map((item) =>
        item.href === "/dashboard/variables" && pendingCount > 0
          ? { ...item, badge: pendingCount }
          : item
      ),
    [pendingCount]
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="relative z-20 hidden w-60 flex-shrink-0 border-r border-zinc-800 bg-[#0f172a] md:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-zinc-800 px-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 font-mono"
            >
              <Terminal className="h-5 w-5 text-green-400" />
              <span className="text-sm font-semibold text-zinc-100">
                <span className="text-green-400">$</span> envpilot
              </span>
            </Link>
          </div>

          {/* Organization Switcher */}
          <div className="border-b border-zinc-800 p-3">
            <OrganizationSwitcher
              currentOrgId={organization?.id ?? undefined}
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-3">
            {navItemsWithBadges.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>

          {/* User Menu */}
          <div className="border-t border-zinc-800 p-3">
            <UserButton />
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
          <UserButton />
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
                {navItemsWithBadges.map((item) => (
                  <NavLink
                    key={item.href}
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
