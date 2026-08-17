"use client";

import { useState } from "react";
import { SettingsRow, SettingsSection } from "@envpilot/ui";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useSavePreferences } from "@/hooks/usePreferences";
import { createLogger } from "@/lib/logger";

const log = createLogger("settings/notifications");

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

const DEFAULT_PREFS: NotificationPrefs = {
  variableChanges: true,
  memberUpdates: true,
  accessRequests: true,
  securityAlerts: true,
  rotationReminders: true,
};

export function NotificationSettings() {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const savePreferences = useSavePreferences();

  // Reactive read: Convex pushes the stored preferences once they load, and
  // again if another tab changes them.
  const stored = useQuery(api.features.users.preferences.getByUserId, {});
  const isLoading = stored === undefined;

  // The stored value is the source of truth and `optimistic` is only the
  // pending toggle. DERIVED, not copied into state by an effect: syncing
  // props-to-state in an effect costs an extra render pass on every push
  // from the query, and the two copies can disagree in between.
  const [optimistic, setOptimistic] = useState<NotificationPrefs | null>(null);
  const prefs: NotificationPrefs = optimistic ?? {
    ...DEFAULT_PREFS,
    ...stored?.emailNotifications,
    // Optional in storage (rows written before it existed have no value);
    // the switches need a concrete boolean.
    rotationReminders: stored?.emailNotifications?.rotationReminders ?? true,
  };

  async function handleToggle(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setOptimistic(next);
    setSavingKey(key);

    try {
      await savePreferences({ emailNotifications: next });
      // Keep the override: it already equals what was stored, so holding it
      // avoids a flicker back to the old value while the query catches up.
    } catch (err) {
      log.error("notification_preference_save_failed", { key }, err);
      // Drop it and fall back to whatever storage actually says.
      setOptimistic(null);
    }
    // After the try/catch, not in a `finally`: React Compiler bails on the
    // whole component when a try carries a finalizer.
    setSavingKey(null);
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
