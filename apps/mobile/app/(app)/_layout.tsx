import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/stores/auth.store";

export default function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#050807" },
        animation: "slide_from_right",
      }}
    />
  );
}
