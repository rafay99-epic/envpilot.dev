import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ToastContainer } from "@/components/ui/Toast";

/**
 * Content is capped at `max-w-7xl` by default. A route can opt into full
 * width by rendering ANY element carrying a `data-wide` attribute anywhere in
 * its tree — e.g. `<div data-wide>…</div>`. The `:has()` selector on the
 * content wrapper then drops the max-width. No context, no props, pure CSS.
 */
export function Layout() {
  return (
    <div className="flex h-screen bg-canvas text-ink">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto">
        {/* Subtle 40px grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8 [&:has([data-wide])]:max-w-none">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
      <ToastContainer />
    </div>
  );
}
