import { View, ActivityIndicator, Text } from "react-native";

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-[#0f172a]">
      <ActivityIndicator size="large" color="#22c55e" />
      {message ? (
        <Text className="mt-4 font-sans text-sm text-zinc-500">{message}</Text>
      ) : null}
    </View>
  );
}
