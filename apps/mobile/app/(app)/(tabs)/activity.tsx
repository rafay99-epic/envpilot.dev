import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { useAppStore } from "@/stores/app.store";
import type { Doc } from "convex/_generated/dataModel";
import React from "react";

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function severityVariant(
  severity?: string
): "green" | "amber" | "red" | "zinc" {
  switch (severity) {
    case "critical":
    case "error":
      return "red";
    case "warning":
      return "amber";
    default:
      return "zinc";
  }
}

const AuditItem = React.memo(function AuditItem({
  item,
}: {
  item: Doc<"auditLogs">;
}) {
  return (
    <View className="mx-4 mb-2 rounded-lg border border-zinc-700/50 bg-zinc-900/90 px-4 py-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="font-mono-medium text-sm text-zinc-200">
            {item.action}
          </Text>
          {item.details ? (
            <Text
              className="mt-1 font-sans text-xs text-zinc-500"
              numberOfLines={2}
            >
              {item.details}
            </Text>
          ) : null}
        </View>
        <View className="ml-3 items-end gap-1">
          <Text className="font-mono text-xs text-zinc-600">
            {formatTime(item.createdAt)}
          </Text>
          {item.severity ? (
            <Badge label={item.severity} variant={severityVariant(item.severity)} />
          ) : null}
        </View>
      </View>
    </View>
  );
});

export default function ActivityScreen() {
  const activeOrgId = useAppStore((s) => s.activeOrgId);

  const auditLogs = useQuery(
    api.auditLogs.listByOrganization,
    activeOrgId ? { organizationId: activeOrgId, limit: 50 } : "skip"
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Activity
        </Text>
      </View>

      {!activeOrgId ? (
        <EmptyState
          title="No organization selected"
          description="Select an organization from the Home tab to view activity."
          icon="◉"
        />
      ) : auditLogs === undefined ? (
        <View className="flex-1 items-center justify-center">
          <Text className="font-mono text-sm text-zinc-500">Loading...</Text>
        </View>
      ) : auditLogs.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Actions in your organization will appear here."
          icon="◉"
        />
      ) : (
        <FlashList
          data={auditLogs}
          renderItem={({ item }) => <AuditItem item={item} />}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingTop: 16 }}
        />
      )}
    </SafeAreaView>
  );
}
