import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-[#0f172a] px-6">
          <Text className="mb-2 font-mono-semibold text-lg text-red-400">
            Something went wrong
          </Text>
          <Text className="mb-6 text-center font-mono text-sm text-zinc-500">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </Text>
          <Pressable
            onPress={this.handleReset}
            className="rounded-lg border border-green-500/30 bg-green-500/10 px-6 py-3"
          >
            <Text className="font-sans-semibold text-base text-green-400">
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
