import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import { Icon } from "@/components/ui/Icon";

type AlertType = "anomaly" | "approval" | "share" | "variable" | "expired" | "digest";

type FilterKey = "all" | "anomalies" | "approvals" | "shares";

interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  subtitle: string;
  time: string;
  color: string;
  icon: string;
  isNew: boolean;
}

const ALERTS: AlertItem[] = [
  {
    id: "1",
    type: "anomaly",
    title: "Unusual access from new IP",
    subtitle: "tudo-tech-lab · 154.192.128.47",
    time: "2m",
    color: colors.red,
    icon: "flame",
    isNew: true,
  },
  {
    id: "2",
    type: "approval",
    title: "Hammad requests STRIPE_SECRET",
    subtitle: "react-web-app · production",
    time: "14m",
    color: colors.amber,
    icon: "lock",
    isNew: true,
  },
  {
    id: "3",
    type: "share",
    title: "Share link viewed",
    subtitle: "VITE_GOOGLE_MAPS_API_KEY · umaidnaeem",
    time: "1h",
    color: colors.blue,
    icon: "share",
    isNew: false,
  },
  {
    id: "4",
    type: "variable",
    title: "Aysha added 3 new variables",
    subtitle: "tudonum-backend",
    time: "3h",
    color: colors.green,
    icon: "plus",
    isNew: false,
  },
  {
    id: "5",
    type: "expired",
    title: "Share link expired",
    subtitle: "VITE_STRIPE_PUBLIC_KEY",
    time: "5h",
    color: colors.muted,
    icon: "clock",
    isNew: false,
  },
  {
    id: "6",
    type: "digest",
    title: "Weekly audit summary ready",
    subtitle: "236 events · 0 security",
    time: "1d",
    color: colors.purple,
    icon: "pulse",
    isNew: false,
  },
];

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "all" },
  { key: "anomalies", label: "anomalies" },
  { key: "approvals", label: "approvals" },
  { key: "shares", label: "shares" },
];

const FILTER_TYPE_MAP: Record<FilterKey, AlertType[] | null> = {
  all: null,
  anomalies: ["anomaly"],
  approvals: ["approval"],
  shares: ["share"],
};

function getIconBg(color: string): string {
  return color + "22";
}

function AlertCard({ item }: { item: AlertItem }) {
  return (
    <View style={styles.alertCard}>
      {item.isNew && <View style={[styles.newIndicator, { backgroundColor: colors.red }]} />}

      <View style={[styles.iconBox, { backgroundColor: getIconBg(item.color) }]}>
        <Icon name={item.icon} size={16} color={item.color} />
      </View>

      <View style={styles.alertContent}>
        <View style={styles.alertTopRow}>
          <Text style={[styles.typeLabel, { color: item.color }]}>
            {item.type.toUpperCase()}
          </Text>
          <Text style={styles.timeLabel}>{item.time}</Text>
        </View>
        <Text style={styles.alertTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.alertSubtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
    </View>
  );
}

export default function AlertsScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const filteredAlerts = FILTER_TYPE_MAP[activeFilter]
    ? ALERTS.filter((a) => FILTER_TYPE_MAP[activeFilter]!.includes(a.type))
    : ALERTS;

  const newCount = ALERTS.filter((a) => a.isNew).length;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* CmdHead */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.cmdPrompt}>$ envpilot inbox</Text>
          <Text style={styles.headerTitle}>Alerts</Text>
        </View>
        {newCount > 0 && (
          <View style={styles.newChip}>
            <Text style={styles.newChipText}>{newCount} new</Text>
          </View>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={[
                styles.filterChip,
                isActive ? styles.filterChipActive : styles.filterChipInactive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Alert list */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredAlerts.map((item) => (
          <AlertCard key={item.id} item={item} />
        ))}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  /* Header / CmdHead */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    gap: 2,
  },
  cmdPrompt: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  newChip: {
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.green,
  },

  /* Filters */
  filterScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterChipActive: {
    backgroundColor: "#e6eee9",
  },
  filterChipInactive: {
    backgroundColor: colors.surface,
  },
  filterChipText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
  },
  filterChipTextActive: {
    color: "#050807",
  },
  filterChipTextInactive: {
    color: colors.muted,
  },

  /* Alert list */
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  bottomSpacer: {
    height: 32,
  },

  /* Alert card */
  alertCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    position: "relative",
  },
  newIndicator: {
    position: "absolute",
    left: -3,
    top: 14,
    width: 3,
    height: 24,
    borderRadius: 2,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  alertContent: {
    flex: 1,
  },
  alertTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  typeLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  timeLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  alertTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  alertSubtitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
});
