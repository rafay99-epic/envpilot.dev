import { View, Text } from "react-native";

type BadgeVariant = "green" | "amber" | "red" | "blue" | "purple" | "zinc";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  green: "bg-green-500/10 border-green-500/20",
  amber: "bg-amber-500/10 border-amber-500/20",
  red: "bg-red-500/10 border-red-500/20",
  blue: "bg-blue-500/10 border-blue-500/20",
  purple: "bg-purple-500/10 border-purple-500/20",
  zinc: "bg-zinc-700/50 border-zinc-600/50",
};

const textStyles: Record<BadgeVariant, string> = {
  green: "text-green-400",
  amber: "text-amber-400",
  red: "text-red-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
  zinc: "text-zinc-400",
};

export function Badge({ label, variant = "zinc" }: BadgeProps) {
  return (
    <View
      className={`rounded-full border px-2 py-0.5 ${variantStyles[variant]}`}
    >
      <Text className={`font-sans-medium text-xs ${textStyles[variant]}`}>
        {label}
      </Text>
    </View>
  );
}
