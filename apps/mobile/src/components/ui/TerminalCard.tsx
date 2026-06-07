import { View, Text } from "react-native";
import type { ReactNode } from "react";
import type { ViewStyle } from "react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

interface TerminalCardProps {
  title?: string;
  accent?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
  borderColor?: string;
}

export function TerminalCard({ title, accent, children, style, borderColor }: TerminalCardProps) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: borderColor || colors.border,
        borderRadius: 14,
        overflow: "hidden",
        ...style,
      }}
    >
      {title ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: "rgba(255,255,255,0.015)",
          }}
        >
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff5f57" }} />
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#febc2e" }} />
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#28c840" }} />
          </View>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.muted }}>{title}</Text>
          {accent ? <View style={{ marginLeft: "auto" }}>{accent}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
