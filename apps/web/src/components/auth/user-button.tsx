"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuthContext } from "./auth-provider";

export function UserButton() {
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
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
        <div className="absolute -top-8 right-0 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-800">
          Viewing as {user.email}
        </div>
      )}

      {/* User Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="User menu"
      >
        {user.profilePictureUrl ? (
          <img
            src={user.profilePictureUrl}
            alt={`${user.firstName ?? "User"}'s avatar`}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            {initials}
          </div>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-zinc-200 bg-white py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          {/* User Info */}
          <div className="border-b border-zinc-200 px-4 pb-3 dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {user.email}
            </p>
            {organization && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {organization.name}
              </p>
            )}
            {user.role && (
              <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                {user.role}
              </span>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <Link
              href="/dashboard"
              className="block px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              onClick={() => setIsOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/settings"
              className="block px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
              onClick={() => setIsOpen(false)}
            >
              Settings
            </Link>
          </div>

          {/* Sign Out */}
          <div className="border-t border-zinc-200 pt-1 dark:border-zinc-700">
            <button
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
