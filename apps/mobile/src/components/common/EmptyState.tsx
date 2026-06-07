import { View, Text } from "react-native";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: string;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      {icon ? (
        <Text className="mb-4 text-4xl">{icon}</Text>
      ) : null}
      <Text className="font-sans-semibold text-lg text-zinc-300">{title}</Text>
      <Text className="mt-2 text-center font-sans text-sm text-zinc-500">
        {description}
      </Text>
    </View>
  );
}
