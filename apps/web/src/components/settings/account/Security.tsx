"use client";

import { useEffect, useState } from "react";
import { Monitor, Shield, Terminal } from "lucide-react";
import { DangerRow, SettingsSection } from "@envpilot/ui";
import {
  TerminalBadge,
  TerminalButton,
} from "@/components/dashboard/terminal-ui";

interface Session {
  id: string;
  type: "cli" | "extension";
  deviceName: string;
  lastUsedAt: number | null;
  createdAt: number;
  expiresAt: number;
}

export function SecuritySettings() {
  const [sessions, setSessions] = useState<{
    cli: Session[];
    extension: Session[];
  }>({ cli: [], extension: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/users/me/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch {
        // Leave empty
      } finally {
        setIsLoading(false);
      }
    }
    fetchSessions();
  }, []);

  async function handleRevokeAll() {
    setIsRevoking(true);
    setRevokeMessage(null);

    try {
      const res = await fetch("/api/users/me/sessions", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setSessions({ cli: [], extension: [] });
        setRevokeMessage(`Revoked ${data.revoked} session(s)`);
        setTimeout(() => setRevokeMessage(null), 3000);
      }
    } catch {
      setRevokeMessage("Failed to revoke sessions");
    } finally {
      setIsRevoking(false);
    }
  }

  const allSessions = [...sessions.cli, ...sessions.extension];

  return (
    <div>
      <SettingsSection
        title="Browser session"
        description="Your current browser session"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Shield className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-ink">
                Current session
              </p>
              <p className="text-[13px] text-ink-subtle">
                This device &middot; Active now
              </p>
            </div>
          </div>
          <TerminalBadge color="green">Active</TerminalBadge>
        </div>
      </SettingsSection>

      <SettingsSection
        title="CLI & extension sessions"
        description="Active sessions from CLI and IDE extensions"
      >
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded-panel bg-surface-raised"
              />
            ))}
          </div>
        ) : allSessions.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">
            No active CLI or extension sessions
          </p>
        ) : (
          <ul className="-my-1">
            {allSessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {session.type === "cli" ? (
                    <Terminal className="h-4 w-4 shrink-0 text-ink-muted" />
                  ) : (
                    <Monitor className="h-4 w-4 shrink-0 text-ink-muted" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">
                      {session.deviceName}
                    </p>
                    <p className="text-[13px] text-ink-subtle">
                      {session.lastUsedAt
                        ? `Last used ${formatRelativeTime(session.lastUsedAt)}`
                        : `Created ${formatRelativeTime(session.createdAt)}`}
                    </p>
                  </div>
                </div>
                <TerminalBadge
                  color={session.type === "cli" ? "amber" : "green"}
                >
                  {session.type === "cli" ? "CLI" : "Extension"}
                </TerminalBadge>
              </li>
            ))}
          </ul>
        )}

        {allSessions.length > 0 && (
          <DangerRow
            title="Revoke all sessions"
            description="Signs out every CLI and IDE extension session. Each device has to log in again before it can pull or push variables."
            action={
              <div className="flex items-center gap-3">
                {revokeMessage && (
                  <p className="text-[13px] text-accent">{revokeMessage}</p>
                )}
                <TerminalButton
                  variant="danger"
                  onClick={handleRevokeAll}
                  disabled={isRevoking}
                >
                  {isRevoking ? "Revoking..." : "Revoke all sessions"}
                </TerminalButton>
              </div>
            }
          />
        )}
      </SettingsSection>
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
