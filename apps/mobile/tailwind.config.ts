import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: "#0f172a",
          card: "rgba(24,24,27,0.9)",
          input: "#18181b",
          elevated: "#27272a",
          green: "#22c55e",
          "green-muted": "rgba(34,197,94,0.1)",
          "green-border": "rgba(34,197,94,0.3)",
          amber: "#fbbf24",
          red: "#ef5350",
        },
      },
      fontFamily: {
        sans: ["Geist_400Regular"],
        "sans-medium": ["Geist_500Medium"],
        "sans-semibold": ["Geist_600SemiBold"],
        "sans-bold": ["Geist_700Bold"],
        mono: ["GeistMono_400Regular"],
        "mono-medium": ["GeistMono_500Medium"],
        "mono-semibold": ["GeistMono_600SemiBold"],
      },
    },
  },
  plugins: [],
} satisfies Config;
