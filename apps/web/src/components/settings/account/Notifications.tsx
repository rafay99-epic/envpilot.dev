"use client";

import { useEffect, useState } from "react";
import { SettingsRow, SettingsSection } from "@envpilot/ui";

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
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const res = await fetch("/api/users/me/preferences");
        if (res.ok) {
          const data = await res.json();
          if (data.emailNotifications) {
            setPrefs(data.emailNotifications);
          }
        }
      } catch {
        // Use defaults
      } finally {
        setIsLoading(false);
      }
    }
    fetchPreferences();
  }, []);

  async function handleToggle(key: keyof NotificationPrefs) {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(newPrefs);
    setSavingKey(key);

    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: newPrefs }),
      });
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
