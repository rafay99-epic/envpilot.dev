import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import type { Id, Doc } from "convex/_generated/dataModel";
import React from "react";

const ENVIRONMENTS = ["development", "staging", "production"] as const;

const VariableRow = React.memo(function VariableRow({
  item,
}: {
  item: Doc<"environmentVariables">;
}) {
  return (
    <Pressable
      onPress={() =>
        router.push(`/(app)/projects/${item.projectId}/variables/${item._id}`)
      }
      className="mx-4 mb-2 rounded-lg border border-zinc-700/50 bg-zinc-900/90 px-4 py-3"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="font-mono-medium text-sm text-green-400">
            {item.key}
          </Text>
          <Text className="mt-1 font-mono text-xs text-zinc-600">
            {item.isSensitive ? "••••••••" : item.vaultRef.slice(0, 8) + "..."}
          </Text>
        </View>
        <View className="items-end gap-1">
          {item.isSensitive ? <Badge label="sensitive" variant="red" /> : null}
          <Text className="font-mono text-xs text-zinc-600">
            v{item.version}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = id as Id<"projects">;
  const [activeEnv, setActiveEnv] = useState<string>("development");

  const project = useQuery(api.projects.getById, { projectId });

  const variables = useQuery(api.variables.listByProject, {
    projectId,
    environment: activeEnv,
  });

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()}>
            <Text className="font-sans text-sm text-green-400">← Back</Text>
          </Pressable>
          <View className="flex-1">
            <Text className="font-sans-semibold text-lg text-zinc-100">
              {project?.name ?? "Loading..."}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="border-b border-zinc-800"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 8 }}
      >
        {ENVIRONMENTS.map((env) => (
          <Pressable
            key={env}
            onPress={() => setActiveEnv(env)}
            className={`rounded-full border px-3 py-1.5 ${
              activeEnv === env
                ? "border-green-500/30 bg-green-500/10"
                : "border-zinc-700 bg-zinc-800"
            }`}
          >
            <Text
              className={`font-mono text-xs ${activeEnv === env ? "text-green-400" : "text-zinc-400"}`}
            >
              {env}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {variables === undefined ? (
        <View className="flex-1 items-center justify-center">
          <Text className="font-mono text-sm text-zinc-500">Loading...</Text>
        </View>
      ) : variables.length === 0 ? (
        <EmptyState
          title="No variables"
          description={`No variables in ${activeEnv} environment.`}
          icon="{ }"
        />
      ) : (
        <FlashList
          data={variables}
          renderItem={({ item }) => <VariableRow item={item} />}
          estimatedItemSize={64}
          contentContainerStyle={{ paddingTop: 12 }}
        />
      )}
    </SafeAreaView>
  );
}
