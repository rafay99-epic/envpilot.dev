import { useState } from "react";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { TerminalCard } from "@/components/ui/TerminalCard";
import { Button } from "@/components/ui/Button";
import { getOAuthURL } from "@/api/auth";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const authUrl = await getOAuthURL();
      await WebBrowser.openBrowserAsync(authUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0f172a]">
      <View className="flex-1 items-center justify-center px-6">
        <View className="mb-8 items-center">
          <Text className="font-mono-semibold text-2xl text-green-400">
            $ envpilot
          </Text>
          <Text className="mt-2 font-sans text-sm text-zinc-500">
            Secure environment variable management
          </Text>
        </View>

        <TerminalCard title="authentication" className="w-full">
          <View className="gap-4">
            <View>
              <Text className="font-mono text-xs text-zinc-500">
                {">"} Connecting to Envpilot...
              </Text>
              <Text className="mt-1 font-mono text-xs text-zinc-400">
                Sign in to access your organizations, projects, and environment
                variables.
              </Text>
            </View>

            {error ? (
              <View className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <Text className="font-mono text-xs text-red-400">{error}</Text>
              </View>
            ) : null}

            <Button
              title="Sign in"
              onPress={handleLogin}
              loading={loading}
              variant="primary"
            />
          </View>
        </TerminalCard>

        <Text className="mt-6 font-sans text-xs text-zinc-600">
          By signing in, you agree to our Terms of Service
        </Text>
      </View>
    </SafeAreaView>
  );
}
