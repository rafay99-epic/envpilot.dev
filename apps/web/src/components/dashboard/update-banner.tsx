"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, X } from "lucide-react";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const INITIAL_DELAY = 30 * 1000; // 30s — let the page finish loading first
const LOADED_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

export function UpdateBanner() {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function checkVersion() {
      try {
        const res = await fetch("/api/version", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data.web as string;

        if (
          serverVersion &&
          serverVersion !== LOADED_VERSION &&
          serverVersion !== dismissedVersionRef.current
        ) {
          setNewVersion(serverVersion);
          setDismissed(false);
        }
      } catch {
        // Silent — no network or abort shouldn't break the app
      }
    }

    // Defer first check so it doesn't compete with initial page load
    const timeout = setTimeout(() => {
      checkVersion();
    }, INITIAL_DELAY);

    const interval = setInterval(checkVersion, POLL_INTERVAL);

    return () => {
      controller.abort();
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  if (!newVersion || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <div className="overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-xl backdrop-blur-sm">
        {/* Terminal window header — matches TerminalWindow component */}
        <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-3 py-1.5">
          <div className="h-2 w-2 rounded-full bg-[#ef5350]/80" />
          <div className="h-2 w-2 rounded-full bg-[#fbbf24]/80" />
          <div className="h-2 w-2 rounded-full bg-[#22c55e]/80" />
          <span className="ml-1 font-mono text-[10px] text-zinc-500">
            update
          </span>
        </div>

        {/* Content */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="font-mono text-xs">
            <span className="text-green-400">$</span>{" "}
            <span className="text-zinc-400">new release</span>{" "}
            <span className="rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-green-400">
              v{newVersion}
            </span>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 font-mono text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20"
          >
            <RefreshCw className="h-3 w-3" />
            refresh
          </button>

          <button
            onClick={() => {
              dismissedVersionRef.current = newVersion;
              setDismissed(true);
            }}
            className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
