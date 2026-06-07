import { Text } from "react-native";
import type { TextStyle } from "react-native";
import { fonts } from "@/theme/typography";

interface ChipMonoProps {
  label: string;
  bg?: string;
  color?: string;
  style?: TextStyle;
}

export function ChipMono({ label, bg = "rgba(255,255,255,0.04)", color = "#7e8a83", style }: ChipMonoProps) {
  return (
    <Text
      style={{
        fontFamily: fonts.mono,
        fontSize: 10.5,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: bg,
        color,
        overflow: "hidden",
        ...style,
      }}
    >
      {label}
    </Text>
  );
}
