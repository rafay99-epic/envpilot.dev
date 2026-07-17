"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuthContext } from "./auth-provider";
import { roleLabel } from "@/lib/roles";
import { LogOut, LayoutDashboard, Settings } from "lucide-react";

export function UserButton({ collapsed }: { collapsed?: boolean }) {
  const { user, organization, isImpersonating, impersonator, signOut } =
    useAuthContext();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
      >
        Sign In
      </Link>
    );
  }

  const initials =
    `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
    user.email[0].toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      {/* Impersonation Banner */}
      {isImpersonating && impersonator && (
        <div className="absolute -top-8 right-0 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
          Viewing as {user.email}
        </div>
      )}

      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-zinc-800 ${collapsed ? "justify-center" : ""}`}
        aria-label="User menu"
        title={collapsed ? `${user.firstName} ${user.lastName}` : undefined}
      >
        {user.profilePictureUrl ? (
          <Image
            src={user.profilePictureUrl}
            alt={`${user.firstName ?? "User"}'s avatar`}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-zinc-700"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-sm font-medium text-green-400 ring-2 ring-zinc-700">
            {initials}
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-zinc-200">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
        )}
      </button>

      {/* Dropdown Menu — opens upward in sidebar, downward when collapsed (mobile header) */}
      {isOpen && (
        <div
          className={`absolute z-50 w-64 overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-2xl ${
            collapsed ? "right-0 top-full mt-2" : "bottom-full left-0 mb-2"
          }`}
        >
          {/* User Info */}
          <div className="border-b border-zinc-700/50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-100">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-zinc-500">{user.email}</p>
            {organization && (
              <p className="mt-1 text-xs text-zinc-500 capitalize">
                {organization.name}
              </p>
            )}
            {user.role && (
              <span className="mt-2 inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                {roleLabel(user.role)}
              </span>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-green-500/5 hover:text-green-400"
              onClick={() => setIsOpen(false)}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-green-500/5 hover:text-green-400"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="h-4 w-4" />
              Account Settings
            </Link>
          </div>

          {/* Sign Out */}
          <div className="border-t border-zinc-700/50 py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-[#ef5350] transition-colors hover:bg-red-500/5"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
