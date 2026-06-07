import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import type { TextInputProps } from "react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  mono?: boolean;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, mono, icon, rightIcon, style, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.red : focused ? colors.green : colors.border;

  return (
    <View>
      {label ? (
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: colors.muted,
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        {icon}
        <TextInput
          placeholderTextColor={colors.muted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            {
              flex: 1,
              fontFamily: mono ? fonts.mono : fonts.sans,
              fontSize: mono ? 13 : 14,
              color: colors.textPrimary,
              padding: 0,
            },
            style,
          ]}
          {...props}
        />
        {rightIcon}
      </View>
      {error ? (
        <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.red, marginTop: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
