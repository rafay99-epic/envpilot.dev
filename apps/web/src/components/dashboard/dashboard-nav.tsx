"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@/components/auth";
import { useAuthContext } from "@/components/auth";
import {
  Boxes,
  BookText,
  FileKey,
  LayoutDashboard,
  FolderOpen,
  Key,
  KeyRound,
  Share2,
  Users,
  Inbox,
  FileText,
  GitPullRequest,
  ClipboardList,
  BarChart3,
  Gauge,
  Settings,
  Menu,
  X,
  Terminal,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ROLE_LEVEL, roleLevel } from "@/lib/roles";
import { useTierStoreSync } from "@/hooks/useTierStore";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette";
import {
  useConvexUser,
  useProjectBySlug,
  usePendingRequestCount,
  useHasSharedWithMe,
} from "@/hooks";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Small count pill next to the label — only shown when > 0. */
  badge?: number;
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
          ? "border-l-2 border-accent-line bg-accent-soft text-accent"
          : "border-l-2 border-transparent text-ink-subtle hover:bg-accent-soft hover:text-accent"
      }`}
    >
      {item.icon}
      {!collapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {!!item.badge && (
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

export function DashboardNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { organization, roleMeta, user } = useAuthContext();
  const { convexUserId } = useConvexUser(user?.id);

  // Hydrate Zustand tier store from Convex — one subscription for all dashboard pages
  useTierStoreSync();

  // Mirror the per-page <RequireRole> guards so the nav only shows pages the
  // current role can actually open (unknown/loading role → developer level).
  // Server-resolved registry level first — static map scores custom roles 0.
  const level = roleMeta?.level ?? roleLevel(organization?.role);
  const isOwner = level >= ROLE_LEVEL.owner;
  const isProjectManagerPlus = level >= ROLE_LEVEL.project_manager;
  const isTeamLeadPlus = level >= ROLE_LEVEL.team_lead;

  // Detect project context from pathname
  const projectSlugMatch = pathname.match(/^\/dashboard\/projects\/([^/]+)/);
  const projectSlug =
    projectSlugMatch?.[1] && projectSlugMatch[1] !== "new"
      ? projectSlugMatch[1]
      : null;
  const isProjectContext = !!projectSlug;

  // Pending request count for the project-level "Requests" badge — resolved
  // by slug (the nav only has the slug, not the project id from the page).
  const navProject = useProjectBySlug(
    organization?.id ?? undefined,
    projectSlug ?? undefined
  );
  const pendingRequestCount = usePendingRequestCount(
    navProject?._id,
    convexUserId
  );

  // Org-level settings href
  const orgSettingsHref = organization?.slug
    ? `/organizations/${organization.slug}/settings`
    : "/dashboard/settings";

  // Team members href — link directly to avoid redirect via /dashboard/team
  const orgTeamHref = organization?.slug
    ? `/organizations/${organization.slug}/members`
    : "/dashboard/team";

  // Only surfaced once something has actually been shared with this reader.
  // An always-visible empty inbox is noise for the majority who never receive
  // one, and the notification email deep-links straight to the page anyway.
  const hasSharedDocs = useHasSharedWithMe() === true;

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
      href: "/dashboard/workspaces",
      label: "Workspaces",
      icon: <Boxes className="h-4 w-4" />,
    },
    // Variable request review is team_lead+ (reviewers: owner / PM / team lead)
    ...(isTeamLeadPlus
      ? [
          {
            href: "/dashboard/requests",
            label: "Requests",
            icon: <Inbox className="h-4 w-4" />,
          },
        ]
      : []),
    ...(hasSharedDocs
      ? [
          {
            href: "/dashboard/docs/shared",
            label: "Shared with me",
            icon: <FileText className="h-4 w-4" />,
          },
        ]
      : []),
    // Team management is team_lead+ (developers cannot invite or manage anyone)
    ...(isTeamLeadPlus
      ? [
          {
            href: orgTeamHref,
            label: "Team",
            icon: <Users className="h-4 w-4" />,
          },
        ]
      : []),
    // Audit logs are project_manager+
    ...(isProjectManagerPlus
      ? [
          {
            href: "/dashboard/audit",
            label: "Audit Logs",
            icon: <ClipboardList className="h-4 w-4" />,
          },
        ]
      : []),
    // Analytics is project_manager+
    ...(isProjectManagerPlus
      ? [
          {
            href: "/dashboard/analytics",
            label: "Analytics",
            icon: <BarChart3 className="h-4 w-4" />,
          },
        ]
      : []),
    // Billing/usage and org settings are owner-only (personal settings stay
    // reachable via the user menu)
    ...(isOwner
      ? [
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
        ]
      : []),
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
          href: `/dashboard/projects/${projectSlug}/requests`,
          label: "Requests",
          icon: <GitPullRequest className="h-4 w-4" />,
          badge: pendingRequestCount,
        },
        {
          href: `/dashboard/projects/${projectSlug}/accounts`,
          label: "Accounts",
          icon: <KeyRound className="h-4 w-4" />,
        },
        {
          href: `/dashboard/projects/${projectSlug}/files`,
          label: "Files",
          icon: <FileKey className="h-4 w-4" />,
        },
        {
          href: `/dashboard/projects/${projectSlug}/docs`,
          label: "Docs",
          icon: <BookText className="h-4 w-4" />,
        },
        {
          href: `/dashboard/projects/${projectSlug}/shared`,
          label: "Shared",
          icon: <Share2 className="h-4 w-4" />,
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
        className={`relative z-20 hidden shrink-0 border-r border-line bg-chrome transition-all duration-200 md:block ${
          isCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b border-line px-5">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 font-mono"
            >
              <Terminal className="h-5 w-5 shrink-0 text-accent" />
              {!isCollapsed && (
                <span className="text-sm font-semibold text-ink">
                  <span className="text-accent">$</span> envpilot
                </span>
              )}
            </Link>
          </div>

          {/* Organization Switcher */}
          <div
            className={`border-b border-line ${isCollapsed ? "p-2" : "p-3"}`}
          >
            <OrganizationSwitcher
              currentOrgId={organization?.id ?? undefined}
              collapsed={isCollapsed}
            />
          </div>

          {/* Search Trigger */}
          <div
            className={`border-b border-line ${isCollapsed ? "p-2" : "px-3 py-2"}`}
          >
            <button
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
              }
              title={isCollapsed ? "Search (⌘K)" : undefined}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-sm text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted ${
                isCollapsed ? "justify-center" : "gap-3"
              }`}
            >
              <Search className="h-4 w-4 shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">Search...</span>
                  <kbd className="rounded border border-line bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
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
          <div className="border-t border-line p-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex w-full items-center justify-center rounded-lg p-2 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted"
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
          <div className="border-t border-line p-3">
            <UserButton collapsed={isCollapsed} />
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-line bg-chrome px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-mono">
          <Terminal className="h-5 w-5 text-accent" />
          <span className="text-sm font-semibold text-ink">
            <span className="text-accent">$</span> envpilot
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <UserButton collapsed />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink"
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
          <button
            type="button"
            aria-label="Dismiss"
            className="fixed inset-0 bg-overlay"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-60 bg-chrome">
            <div className="flex h-full flex-col pt-14">
              {/* Organization Switcher */}
              <div className="border-b border-line p-3">
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
