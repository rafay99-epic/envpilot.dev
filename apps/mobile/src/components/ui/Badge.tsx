import { Text } from "react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

type BadgeVariant = "green" | "amber" | "red" | "blue" | "purple" | "muted";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, { bg: string; color: string }> = {
  green: { bg: colors.greenSoft, color: colors.green },
  amber: { bg: colors.amberSoft, color: colors.amber },
  red: { bg: colors.redSoft, color: colors.red },
  blue: { bg: colors.blueSoft, color: colors.blue },
  purple: { bg: colors.purpleSoft, color: colors.purple },
  muted: { bg: colors.white04, color: colors.muted },
};

export function Badge({ label, variant = "green" }: BadgeProps) {
  const v = variants[variant];
  return (
    <Text
      style={{
        fontFamily: fonts.mono,
        fontSize: 10.5,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: v.bg,
        color: v.color,
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}
