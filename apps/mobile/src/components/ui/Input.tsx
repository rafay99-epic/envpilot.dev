import { useState } from "react";
import { View, Text, TextInput, type TextInputProps } from "react-native";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={className}>
      {label ? (
        <Text className="mb-1.5 font-sans-medium text-sm text-zinc-400">
          {label}
        </Text>
      ) : null}
      <TextInput
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="#71717a"
        className={`rounded-lg border bg-zinc-800 px-3 py-3 font-sans text-base text-zinc-100 ${
          focused
            ? "border-green-500/50"
            : error
              ? "border-red-500/50"
              : "border-zinc-700"
        }`}
        {...props}
      />
      {error ? (
        <Text className="mt-1 font-sans text-xs text-red-400">{error}</Text>
      ) : null}
    </View>
  );
}
