import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TerminalCard } from "@/components/ui/TerminalCard";
import { useAuthStore } from "@/stores/auth.store";

export default function ProfileScreen() {
  const userName = useAuthStore((s) => s.userName);
  const userEmail = useAuthStore((s) => s.userEmail);

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Profile
        </Text>
      </View>
      <View className="px-4 pt-4">
        <TerminalCard title="user-info">
          <View className="gap-3">
            <View className="flex-row justify-between">
              <Text className="font-mono text-sm text-zinc-400">Name</Text>
              <Text className="font-mono-medium text-sm text-zinc-200">
                {userName ?? "—"}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="font-mono text-sm text-zinc-400">Email</Text>
              <Text className="font-mono-medium text-sm text-zinc-200">
                {userEmail ?? "—"}
              </Text>
            </View>
          </View>
        </TerminalCard>
      </View>
    </SafeAreaView>
  );
}
