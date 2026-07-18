import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Crown,
  Mail,
  Ticket,
  Users,
  Building2,
  FileText,
  Lightbulb,
  Database,
  ArrowUpDown,
  LogOut,
  Globe,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@workos-inc/authkit-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/web-traffic", label: "Web Traffic", icon: Globe },
  { to: "/tiers", label: "Tiers & Limits", icon: Crown },
  { to: "/roles", label: "Roles", icon: ShieldCheck },
  { to: "/messages", label: "Messages", icon: Mail },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/users", label: "Users", icon: Users },
  { to: "/organizations", label: "Organizations", icon: Building2 },
  { to: "/changelog", label: "Changelog", icon: FileText },
  { to: "/feature-requests", label: "Feature Requests", icon: Lightbulb },
  { to: "/migrations", label: "Migrations", icon: ArrowUpDown },
  { to: "/data", label: "Data Browser", icon: Database },
] as const;

export function Sidebar() {
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-xs font-bold text-white">
          E
        </div>
        <span className="text-sm font-semibold text-zinc-100">
          Envpilot Admin
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
