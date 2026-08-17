"use client";

import { useState } from "react";
import { ExternalLink, Lock } from "lucide-react";
import { SaveBar, SettingsField, SettingsSection } from "@envpilot/ui";
import {
  TerminalBadge,
  TerminalInput,
} from "@/components/dashboard/terminal-ui";
import { useUnsavedChanges } from "@/hooks";
import { useTimeZone } from "@/hooks/useTimeZone";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { formatDateWith } from "@/lib/format";

/** "August 2026" — the member-since line. */
const MEMBER_SINCE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "long",
  year: "numeric",
};

export interface AccountUser {
  firstName: string | null;
  lastName: string | null;
  email: string;
  createdAt: Date;
}

const HELP_LINKS = [
  { href: "/faq", label: "FAQ & how it works" },
  { href: "/terms#billing", label: "Billing terms" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/support", label: "Contact support" },
];

export function GeneralSettings({ user }: { user: AccountUser | null }) {
  const updateProfile = useMutation(api.features.users.users.updateProfile);
  // The snapshot is what "discard" restores and what dirtiness is measured
  // against — it advances only on a successful save.
  const [snapshot, setSnapshot] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
  });
  const [form, setForm] = useState(snapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const { dirtyCount } = useUnsavedChanges(form, snapshot);
  const timeZone = useTimeZone();

  async function handleSave() {
    if (dirtyCount === 0) return;
    setIsSaving(true);
    setSaveMessage(null);
    // Freeze what is being sent: edits typed while the request is in flight
    // must stay dirty rather than be snapshotted as saved.
    const sent = form;

    try {
      // The users row stores one `name`; the form edits it as two fields.
      // That join used to happen in the route.
      await updateProfile({
        name: `${sent.firstName} ${sent.lastName}`.trim(),
      });

      setSnapshot(sent);
      setSaveMessage({ type: "success", text: "Profile updated" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <SettingsSection title="Profile" description="Your personal information">
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="First name" htmlFor="firstName">
            <TerminalInput
              type="text"
              id="firstName"
              value={form.firstName}
              onChange={(e) =>
                setForm((f) => ({ ...f, firstName: e.target.value }))
              }
            />
          </SettingsField>
          <SettingsField label="Last name" htmlFor="lastName">
            <TerminalInput
              type="text"
              id="lastName"
              value={form.lastName}
              onChange={(e) =>
                setForm((f) => ({ ...f, lastName: e.target.value }))
              }
            />
          </SettingsField>
        </div>

        <SettingsField
          label="Email"
          htmlFor="email"
          hint="Email cannot be changed. Contact support if you need to update it."
        >
          <TerminalInput
            type="email"
            id="email"
            value={user?.email || ""}
            disabled
          />
        </SettingsField>

        {saveMessage?.type === "success" && (
          <p className="text-[13px] text-accent">{saveMessage.text}</p>
        )}
      </SettingsSection>

      <SettingsSection
        title="Connected account"
        description="Your authentication provider"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Lock className="h-4 w-4 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-ink">
                {user?.email}
              </p>
              <p className="text-[13px] text-ink-subtle">
                Member since{" "}
                {user?.createdAt
                  ? formatDateWith(
                      user.createdAt,
                      MEMBER_SINCE_OPTIONS,
                      timeZone
                    )
                  : "—"}
              </p>
            </div>
          </div>
          <TerminalBadge color="green">Authenticated via WorkOS</TerminalBadge>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Help & resources"
        description="Common questions and documentation"
      >
        <ul className="-my-1">
          {HELP_LINKS.map((link) => (
            <li key={link.href} className="border-t border-line first:border-0">
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 py-3 text-[14px] text-ink-muted transition-colors hover:text-ink"
              >
                <ExternalLink className="h-3.5 w-3.5 text-accent" />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SaveBar
        dirtyCount={dirtyCount}
        saving={isSaving}
        error={saveMessage?.type === "error" ? saveMessage.text : null}
        onSave={handleSave}
        onDiscard={() => {
          setForm(snapshot);
          setSaveMessage(null);
        }}
      />
    </div>
  );
}
