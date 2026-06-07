import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TerminalCard } from "@/components/ui/TerminalCard";

export default function UsageScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Usage & Tier
        </Text>
      </View>
      <View className="px-4 pt-4">
        <TerminalCard title="subscription">
          <Text className="font-mono text-sm text-zinc-400">
            {">"} Your tier and usage stats will appear here.
          </Text>
          <Text className="mt-2 font-mono text-xs text-zinc-600">
            Billing is managed on the web at envpilot.dev
          </Text>
        </TerminalCard>
      </View>
    </SafeAreaView>
  );
}
