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
    <aside className="flex h-screen w-60 flex-col border-r border-zinc-700/50 bg-[#0f172a]">
      <div className="flex h-14 items-center border-b border-zinc-700/50 px-4">
        <span className="font-mono text-xs lowercase tracking-wide text-zinc-500">
          <span className="text-green-400">$</span> envpilot admin
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
                    "flex items-center gap-3 border-l-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-green-400 bg-green-500/10 text-green-400"
                      : "border-transparent text-zinc-500 hover:bg-green-500/5 hover:text-green-400"
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

      <div className="border-t border-zinc-700/50 p-3">
        <button
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-green-500/5 hover:text-green-400"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
