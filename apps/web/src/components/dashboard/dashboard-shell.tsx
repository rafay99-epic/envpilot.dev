import { AuthErrorBoundary } from "@/components/auth/auth-error-boundary";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { CommandPalette } from "@/components/command-palette";
import { UpdateBanner } from "@/components/dashboard/update-banner";
import { KeyboardShortcutsProvider } from "@/components/keyboard/keyboard-shortcuts-provider";
import React from "react";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // NOTE: no ConvexBoundaryProvider here — the root layout's
  // ConvexClientProvider already mounts AuthKitProvider +
  // ConvexProviderWithAuth around every page. Mounting a second
  // ConvexProviderWithAuth on the same shared ConvexReactClient makes both
  // providers call client.setAuth() and fight over the auth state machine
  // (the loser's useConvexAuth() never resolves).
  //
  // Deliberately NOT gated behind <Authenticated>: the shell renders
  // immediately on load while the WorkOS JWT attaches to the Convex socket.
  // Queries that fire during that window get a transient self-healing
  // "Unauthenticated" error, which AuthErrorBoundary auto-retries past and
  // the Convex client logger treats as an expected condition (breadcrumb,
  // not a Sentry issue). Gating the whole shell on auth readiness was tried
  // and rejected: it blanks the UI for the full auth handshake on every
  // hard navigation (see auth-error-boundary.spec.ts rapid-navigation test).
  return (
    <AuthErrorBoundary context="dashboard-shell">
      <div className="dark flex min-h-screen bg-[#0f172a] text-ink">
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
  );
}
