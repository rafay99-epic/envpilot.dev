import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { useAppStore } from "@/stores/app.store";
import type { Doc } from "convex/_generated/dataModel";
import React from "react";

const ProjectItem = React.memo(function ProjectItem({
  item,
}: {
  item: Doc<"projects">;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/(app)/projects/${item._id}`)}
      className="mx-4 mb-3 rounded-lg border border-zinc-700/50 bg-zinc-900/90 p-4"
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: item.color ?? "#27272a" }}
        >
          <Text className="text-lg">{item.icon ?? "◈"}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold text-base text-zinc-100">
            {item.name}
          </Text>
          {item.description ? (
            <Text
              className="mt-0.5 font-sans text-xs text-zinc-500"
              numberOfLines={1}
            >
              {item.description}
            </Text>
          ) : null}
        </View>
        <Badge label={item.slug} variant="zinc" />
      </View>
    </Pressable>
  );
});

export default function ProjectsScreen() {
  const activeOrgId = useAppStore((s) => s.activeOrgId);

  const projects = useQuery(
    api.projects.listByOrganization,
    activeOrgId ? { organizationId: activeOrgId } : "skip"
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Projects
        </Text>
      </View>

      {!activeOrgId ? (
        <EmptyState
          title="No organization selected"
          description="Select an organization from the Home tab to view projects."
          icon="◈"
        />
      ) : projects === undefined ? (
        <View className="flex-1 items-center justify-center">
          <Text className="font-mono text-sm text-zinc-500">Loading...</Text>
        </View>
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project on the web to get started."
          icon="◈"
        />
      ) : (
        <FlashList
          data={projects}
          renderItem={({ item }) => <ProjectItem item={item} />}
          estimatedItemSize={80}
          contentContainerStyle={{ paddingTop: 16 }}
        />
      )}
    </SafeAreaView>
  );
}
