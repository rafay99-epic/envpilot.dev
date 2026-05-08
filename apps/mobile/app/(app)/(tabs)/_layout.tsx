import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { colors } from "@/theme/colors";

function TabIcon({
  icon,
  focused,
}: {
  icon: string;
  focused: boolean;
}) {
  return (
    <View className="items-center pt-1">
      <Text
        className={`text-lg ${focused ? "text-green-400" : "text-zinc-600"}`}
      >
        {icon}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "rgba(63,63,70,0.5)",
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.textDisabled,
        tabBarLabelStyle: {
          fontFamily: "Geist_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⌂" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◈" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="◉" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚙" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
