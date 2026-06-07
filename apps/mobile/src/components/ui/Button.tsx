import { Pressable, Text, ActivityIndicator } from "react-native";
import type { ViewStyle, TextStyle } from "react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantStyles: Record<ButtonVariant, { bg: string; border: string; text: string }> = {
  primary: { bg: colors.green, border: colors.green, text: "#02110a" },
  secondary: { bg: colors.surface2, border: colors.border, text: colors.textPrimary },
  danger: { bg: "rgba(232,90,90,0.04)", border: colors.redBorder, text: colors.red },
  ghost: { bg: "transparent", border: "transparent", text: colors.muted },
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
}: ButtonProps) {
  const v = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: v.bg,
        borderWidth: variant === "ghost" ? 0 : 1,
        borderColor: v.border,
        borderRadius: variant === "primary" ? 14 : 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 8,
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...style,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              fontFamily: fonts.sansBold,
              fontSize: variant === "primary" ? 15 : 14,
              color: v.text,
              ...textStyle,
            }}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
