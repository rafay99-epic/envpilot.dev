import { Pressable, Text, ActivityIndicator } from "react-native";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string }> = {
  primary: {
    container: "border-green-500/30 bg-green-500/10",
    text: "text-green-400",
  },
  secondary: {
    container: "border-zinc-700 bg-zinc-800",
    text: "text-zinc-300",
  },
  danger: {
    container: "border-red-500/30 bg-red-500/10",
    text: "text-red-400",
  },
  ghost: {
    container: "border-transparent bg-transparent",
    text: "text-zinc-400",
  },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  className,
}: ButtonProps) {
  const styles = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
      className={`flex-row items-center justify-center rounded-lg border px-4 py-3 ${styles.container} ${disabled ? "opacity-50" : ""} ${className ?? ""}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#22c55e" />
      ) : (
        <Text className={`font-sans-semibold text-base ${styles.text}`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
