import { View, Text } from "react-native";
import type { ReactNode } from "react";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

interface MonoCardProps {
  title: string;
  accent?: ReactNode;
  children: ReactNode;
}

export function MonoCard({ title, accent, children }: MonoCardProps) {
  return (
    <View
      style={{
        marginHorizontal: 14,
        marginBottom: 12,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
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
        {accent && <View style={{ marginLeft: "auto" }}>{accent}</View>}
      </View>
      {children}
    </View>
  );
}
