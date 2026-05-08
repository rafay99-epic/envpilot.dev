import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { exchangeCodeForTokens } from "@/api/auth";
import { useAuthStore } from "@/stores/auth.store";

export default function CallbackScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("No authorization code received");
      return;
    }

    let cancelled = false;

    async function handleCallback() {
      try {
        const result = await exchangeCodeForTokens(code!);
        if (cancelled) return;

        await setAuth({
          id: result.user._id,
          email: result.user.email,
          name: result.user.name,
        });

        router.replace("/(app)/(tabs)");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
  }, [code, setAuth]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0f172a",
      }}
    >
      {error ? (
        <View style={{ alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#ef5350", fontSize: 14 }}>{error}</Text>
          <Text
            style={{ color: "#22c55e", fontSize: 14 }}
            onPress={() => router.replace("/(auth)/login")}
          >
            Back to login
          </Text>
        </View>
      ) : (
        <Text style={{ color: "#22c55e" }}>Signing in...</Text>
      )}
    </View>
  );
}
