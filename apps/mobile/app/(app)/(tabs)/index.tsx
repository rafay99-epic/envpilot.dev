import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { TerminalCard } from "@/components/ui/TerminalCard";
import { Badge } from "@/components/ui/Badge";
import { useAuthStore } from "@/stores/auth.store";
import { useAppStore } from "@/stores/app.store";

export default function HomeScreen() {
  const userId = useAuthStore((s) => s.userId);
  const userName = useAuthStore((s) => s.userName);
  const activeOrgId = useAppStore((s) => s.activeOrgId);

  const organizations = useQuery(
    api.organizations.listForUser,
    userId ? { userId } : "skip"
  );

  const activeOrg = organizations?.find((o) => o?._id === activeOrgId);

  const projects = useQuery(
    api.projects.listByOrganization,
    activeOrgId ? { organizationId: activeOrgId } : "skip"
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <ScrollView className="flex-1 px-4 pt-4">
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="font-mono-semibold text-xl text-green-400">
              $ envpilot
            </Text>
            <Text className="mt-1 font-sans text-sm text-zinc-500">
              {userName ? `Welcome, ${userName}` : "Welcome back"}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(app)/organizations")}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5"
          >
            <Text className="font-sans-medium text-xs text-zinc-300">
              {activeOrg?.name ?? "Select Org"}
            </Text>
          </Pressable>
        </View>

        <TerminalCard title="overview" className="mb-4">
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-sm text-zinc-400">
                Organization
              </Text>
              <Text className="font-mono-medium text-sm text-zinc-200">
                {activeOrg?.name ?? "—"}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-sm text-zinc-400">Projects</Text>
              <Text className="font-mono-medium text-sm text-green-400">
                {projects?.length ?? 0}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="font-mono text-sm text-zinc-400">Role</Text>
              {activeOrg?.role ? (
                <Badge
                  label={activeOrg.role}
                  variant={
                    activeOrg.role === "admin"
                      ? "green"
                      : activeOrg.role === "team_lead"
                        ? "amber"
                        : "zinc"
                  }
                />
              ) : (
                <Text className="font-mono text-sm text-zinc-500">—</Text>
              )}
            </View>
          </View>
        </TerminalCard>

        {organizations && organizations.length === 0 ? (
          <TerminalCard title="getting-started">
            <Text className="font-mono text-sm text-zinc-400">
              {">"} No organizations found. Create one on the web to get
              started.
            </Text>
          </TerminalCard>
        ) : null}

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
