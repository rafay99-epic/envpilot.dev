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
        contentStyle: { backgroundColor: "#0f172a" },
        animation: "slide_from_right",
      }}
    />
  );
}
