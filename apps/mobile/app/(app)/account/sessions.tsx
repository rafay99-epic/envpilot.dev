import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TerminalCard } from "@/components/ui/TerminalCard";

export default function SessionsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Sessions
        </Text>
      </View>
      <View className="px-4 pt-4">
        <TerminalCard title="active-sessions">
          <Text className="font-mono text-sm text-zinc-400">
            {">"} Session management coming in Phase 4.
          </Text>
        </TerminalCard>
      </View>
    </SafeAreaView>
  );
}
