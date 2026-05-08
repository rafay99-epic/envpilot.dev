import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { useAuthStore } from "@/stores/auth.store";
import { useAppStore } from "@/stores/app.store";
import type { Id } from "convex/_generated/dataModel";
import React from "react";

interface OrgWithRole {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  role: string;
}

const OrgItem = React.memo(function OrgItem({
  item,
  isActive,
  onSelect,
}: {
  item: OrgWithRole;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={`mx-4 mb-3 rounded-lg border p-4 ${
        isActive
          ? "border-green-500/30 bg-green-500/10"
          : "border-zinc-700/50 bg-zinc-900/90"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text
            className={`font-sans-semibold text-base ${isActive ? "text-green-400" : "text-zinc-100"}`}
          >
            {item.name}
          </Text>
          <Text className="mt-0.5 font-mono text-xs text-zinc-500">
            {item.slug}
          </Text>
        </View>
        <Badge
          label={item.role}
          variant={
            item.role === "admin"
              ? "green"
              : item.role === "team_lead"
                ? "amber"
                : "zinc"
          }
        />
      </View>
    </Pressable>
  );
});

export default function OrganizationsScreen() {
  const userId = useAuthStore((s) => s.userId);
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const setActiveOrg = useAppStore((s) => s.setActiveOrg);

  const organizations = useQuery(
    api.organizations.listForUser,
    userId ? { userId } : "skip"
  );

  const handleSelect = async (orgId: Id<"organizations">) => {
    await setActiveOrg(orgId);
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="flex-row items-center justify-between border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Organizations
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text className="font-sans-medium text-sm text-green-400">Done</Text>
        </Pressable>
      </View>

      {organizations === undefined ? (
        <View className="flex-1 items-center justify-center">
          <Text className="font-mono text-sm text-zinc-500">Loading...</Text>
        </View>
      ) : (
        <FlashList
          data={organizations as OrgWithRole[]}
          renderItem={({ item }) => (
            <OrgItem
              item={item}
              isActive={item._id === activeOrgId}
              onSelect={() => handleSelect(item._id)}
            />
          )}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingTop: 16 }}
        />
      )}
    </SafeAreaView>
  );
}
