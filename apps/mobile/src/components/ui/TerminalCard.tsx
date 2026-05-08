import { View, Text } from "react-native";

interface TerminalCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

function WindowDots() {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full bg-[#ef5350]/80" />
      <View className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/80" />
      <View className="h-2.5 w-2.5 rounded-full bg-[#22c55e]/80" />
    </View>
  );
}

export function TerminalCard({ title, children, className }: TerminalCardProps) {
  return (
    <View
      className={`overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 ${className ?? ""}`}
    >
      <View className="flex-row items-center border-b border-zinc-700/50 px-3 py-2">
        <WindowDots />
        {title ? (
          <Text className="ml-3 font-mono text-xs text-zinc-500">{title}</Text>
        ) : null}
      </View>
      <View className="p-4">{children}</View>
    </View>
  );
}
