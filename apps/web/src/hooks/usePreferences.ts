"use client";

import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

type NotificationPrefs = {
  variableChanges: boolean;
  memberUpdates: boolean;
  accessRequests: boolean;
  securityAlerts: boolean;
  rotationReminders?: boolean;
};

/**
 * Save the signed-in user's preferences.
 *
 * Self-service by construction: the mutation derives the acting user from the
 * verified identity on the socket, so there is no user id to pass and none to
 * get wrong. The old `/api/users/me/preferences` route read the session and
 * called this same mutation.
 */
export function useSavePreferences() {
  const upsert = useMutation(api.features.users.preferences.upsert);
  return (input: {
    emailNotifications?: NotificationPrefs;
    keyboardShortcuts?: Record<string, string>;
  }) => upsert(input);
}
