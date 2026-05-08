import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { TerminalCard } from "@/components/ui/TerminalCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { decryptValue } from "@/api/vault";
import type { Id } from "convex/_generated/dataModel";

export default function VariableDetailScreen() {
  const { varId } = useLocalSearchParams<{ varId: string }>();
  const variableId = varId as Id<"environmentVariables">;
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  const variable = useQuery(api.variables.getById, { variableId });

  const handleReveal = async () => {
    if (revealedValue) {
      setRevealedValue(null);
      return;
    }
    if (!variable) return;
    setRevealing(true);
    const value = await decryptValue(variable.vaultRef);
    setRevealedValue(value);
    setRevealing(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]" edges={["top"]}>
      <View className="border-b border-zinc-700/50 px-4 pb-3 pt-4">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()}>
            <Text className="font-sans text-sm text-green-400">← Back</Text>
          </Pressable>
          <Text className="font-mono-semibold text-lg text-green-400">
            {variable?.key ?? "Loading..."}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {variable ? (
          <>
            <TerminalCard title="details" className="mb-4">
              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-sm text-zinc-400">Key</Text>
                  <Text className="font-mono-medium text-sm text-green-400">
                    {variable.key}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-sm text-zinc-400">
                    Version
                  </Text>
                  <Text className="font-mono-medium text-sm text-zinc-200">
                    v{variable.version}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-sm text-zinc-400">
                    Sensitive
                  </Text>
                  <Badge
                    label={variable.isSensitive ? "Yes" : "No"}
                    variant={variable.isSensitive ? "red" : "zinc"}
                  />
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-sm text-zinc-400">
                    Environments
                  </Text>
                  <View className="flex-row gap-1">
                    {variable.environments.map((env) => (
                      <Badge key={env} label={env} variant="blue" />
                    ))}
                  </View>
                </View>
                {variable.description ? (
                  <View>
                    <Text className="font-mono text-sm text-zinc-400">
                      Description
                    </Text>
                    <Text className="mt-1 font-sans text-sm text-zinc-300">
                      {variable.description}
                    </Text>
                  </View>
                ) : null}
              </View>
            </TerminalCard>

            <TerminalCard title="value" className="mb-4">
              <View className="gap-3">
                <View className="rounded-md bg-zinc-800 p-3">
                  <Text className="font-mono text-sm text-zinc-300">
                    {revealedValue ?? "••••••••••••••••"}
                  </Text>
                </View>
                <Button
                  title={revealedValue ? "Hide Value" : "Reveal Value"}
                  onPress={handleReveal}
                  loading={revealing}
                  variant="secondary"
                />
              </View>
            </TerminalCard>
          </>
        ) : (
          <View className="items-center justify-center py-12">
            <Text className="font-mono text-sm text-zinc-500">Loading...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
