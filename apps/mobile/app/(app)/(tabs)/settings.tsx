import { View, Text, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { TerminalCard } from "@/components/ui/TerminalCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/auth.store";
import { revokeToken } from "@/api/auth";

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center justify-between border-b border-zinc-800 py-3"
    >
      <Text className="font-sans text-sm text-zinc-400">{label}</Text>
      <Text className="font-sans-medium text-sm text-zinc-200">
        {value ?? "—"}
      </Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const userEmail = useAuthStore((s) => s.userEmail);
  const userName = useAuthStore((s) => s.userName);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await revokeToken();
          await clearAuth();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <Text className="font-sans-semibold text-xl text-zinc-100">
          Settings
        </Text>
      </View>

      <View className="flex-1 px-4 pt-4">
        <TerminalCard title="account" className="mb-4">
          <View>
            <SettingsRow label="Name" value={userName ?? undefined} />
            <SettingsRow label="Email" value={userEmail ?? undefined} />
            <SettingsRow
              label="Sessions"
              value="Manage"
              onPress={() => router.push("/(app)/account/sessions")}
            />
            <SettingsRow
              label="Usage & Tier"
              value="View"
              onPress={() => router.push("/(app)/account/usage")}
            />
          </View>
        </TerminalCard>

        <TerminalCard title="about" className="mb-4">
          <View>
            <SettingsRow label="Version" value="1.0.0" />
            <SettingsRow label="Platform" value="Envpilot Mobile" />
          </View>
        </TerminalCard>

        <View className="mt-4">
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="danger"
          />
        </View>

        <View className="mt-4 items-center">
          <Badge label="envpilot.dev" variant="green" />
        </View>
      </View>
    </SafeAreaView>
  );
}
