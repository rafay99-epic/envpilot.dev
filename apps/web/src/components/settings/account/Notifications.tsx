"use client";

import { useEffect, useState } from "react";
import { SettingsRow, SettingsSection } from "@envpilot/ui";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useSavePreferences } from "@/hooks/usePreferences";

interface NotificationPrefs {
  variableChanges: boolean;
  memberUpdates: boolean;
  accessRequests: boolean;
  securityAlerts: boolean;
  rotationReminders: boolean;
}

const NOTIFICATIONS: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: "variableChanges",
    label: "Variable changes",
    description: "When variables you have access to are modified",
  },
  {
    key: "memberUpdates",
    label: "Team updates",
    description: "When members join or leave your organization",
  },
  {
    key: "accessRequests",
    label: "Access requests",
    description: "When someone requests access to variables",
  },
  {
    key: "securityAlerts",
    label: "Security alerts",
    description: "Session revocations and suspicious activity",
  },
  {
    key: "rotationReminders",
    label: "Rotation reminders",
    description: "When secrets are approaching expiry",
  },
];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    variableChanges: true,
    memberUpdates: true,
    accessRequests: true,
    securityAlerts: true,
    rotationReminders: true,
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savePreferences = useSavePreferences();

  // Reactive read: Convex pushes the stored preferences once they load, and
  // again if another tab changes them. Replaces a fetch-in-an-effect that
  // could only ever show a snapshot taken at mount.
  const stored = useQuery(api.features.users.preferences.getByUserId, {});
  const isLoading = stored === undefined;

  useEffect(() => {
    if (!stored?.emailNotifications) return;
    const next = stored.emailNotifications;
    // rotationReminders is optional in storage (rows written before it
    // existed have no value); the UI needs a concrete boolean.
    setPrefs({ ...next, rotationReminders: next.rotationReminders ?? true });
  }, [stored]);

  async function handleToggle(key: keyof NotificationPrefs) {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs);
    setSavingKey(key);

    try {
      await savePreferences({ emailNotifications: newPrefs });
    } catch {
      // Revert on error
      setPrefs(prefs);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div>
      <SettingsSection
        title="Email notifications"
        description="Choose which email notifications you receive"
      >
        {isLoading
          ? [1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded-panel bg-surface-raised"
              />
            ))
          : NOTIFICATIONS.map(({ key, label, description }) => (
              <SettingsRow
                key={key}
                label={label}
                description={description}
                control={
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs[key]}
                    aria-label={label}
                    onClick={() => handleToggle(key)}
                    disabled={savingKey === key}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      prefs[key] ? "bg-accent" : "bg-surface-hover"
                    } ${savingKey === key ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        prefs[key] ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                }
              />
            ))}
      </SettingsSection>
    </div>
  );
}
