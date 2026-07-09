"use client";

import { ConvexBoundaryProvider } from "@/components/ConvexClientProvider";
import { AuthErrorBoundary } from "@/components/auth/auth-error-boundary";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { CommandPalette } from "@/components/command-palette";
import { UpdateBanner } from "@/components/dashboard/update-banner";
import { KeyboardShortcutsProvider } from "@/components/keyboard/keyboard-shortcuts-provider";
import React from "react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <ConvexBoundaryProvider>
      <AuthErrorBoundary context="dashboard-shell">
        <div className="dark flex min-h-screen bg-[#0f172a] text-zinc-100">
          {/* Subtle grid background */}
          <div
            className="pointer-events-none fixed inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* Sidebar Navigation */}
          <DashboardNav />

          {/* Main Content */}
          <main className="relative z-10 flex-1 overflow-auto">
            <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
              {children}
            </div>
          </main>

          {/* Global Keyboard Shortcuts */}
          <KeyboardShortcutsProvider>
            {/* Global Search Command Palette */}
            <CommandPalette />
          </KeyboardShortcutsProvider>

          {/* Update Available Notification */}
          <UpdateBanner />
        </div>
      </AuthErrorBoundary>
    </ConvexBoundaryProvider>
  );
}
