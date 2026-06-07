import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "dash",
          tabBarIcon: ({ color }) => <Icon name="home" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "projects",
          tabBarIcon: ({ color }) => <Icon name="folder" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "activity",
          tabBarIcon: ({ color }) => <Icon name="pulse" size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "alerts",
          tabBarIcon: ({ color }) => (
            <View>
              <Icon name="bell" size={18} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "more",
          tabBarIcon: ({ color }) => <Icon name="cog" size={18} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "rgba(13,20,17,0.9)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 76,
    paddingBottom: 16,
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  tabLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tabIcon: {
    marginBottom: -2,
  },
});
