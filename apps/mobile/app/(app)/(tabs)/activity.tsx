import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useAppStore } from "@/stores/app.store";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogWithUser {
  _id: string;
  action: string;
  details?: string;
  parsedDetails?: Record<string, unknown> | null;
  severity?: string;
  projectId?: string;
  createdAt: number;
  userName?: string;
  userEmail?: string;
  resourceType?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Action classification
// ---------------------------------------------------------------------------

type ActionVerb =
  | "revealed"
  | "requested"
  | "updated"
  | "rotated"
  | "shared"
  | "invited"
  | "joined"
  | "created"
  | "deleted"
  | "exported"
  | "denied"
  | "revoked"
  | "other";

const ACTION_COLORS: Record<ActionVerb, string> = {
  revealed: colors.amber,
  requested: colors.blue,
  updated: colors.green,
  rotated: colors.purple,
  shared: colors.blue,
  invited: colors.green,
  joined: colors.green,
  created: colors.green,
  deleted: colors.red,
  exported: colors.amber,
  denied: colors.red,
  revoked: colors.red,
  other: colors.muted,
};

function classifyAction(action: string): { verb: ActionVerb; label: string } {
  if (action.includes("accessed") || action.includes("viewed"))
    return { verb: "revealed", label: "revealed" };
  if (action.includes("requested")) return { verb: "requested", label: "requested" };
  if (action.includes("updated") || action.includes("changed"))
    return { verb: "updated", label: "updated" };
  if (action.includes("rotated") || action.includes("rotation"))
    return { verb: "rotated", label: "rotated" };
  if (action.includes("share") || action.includes("shared") || action.includes("copied"))
    return { verb: "shared", label: "shared" };
  if (action.includes("invitation") && action.includes("sent"))
    return { verb: "invited", label: "invited" };
  if (action.includes("accepted") || action.includes("joined"))
    return { verb: "joined", label: "joined" };
  if (action.includes("created")) return { verb: "created", label: "created" };
  if (action.includes("deleted")) return { verb: "deleted", label: "deleted" };
  if (action.includes("exported")) return { verb: "exported", label: "exported" };
  if (action.includes("denied") || action.includes("unauthorized") || action.includes("failed"))
    return { verb: "denied", label: "denied" };
  if (action.includes("revoked") || action.includes("removed"))
    return { verb: "revoked", label: "revoked" };
  // Fallback: use the part after the dot
  const parts = action.split(".");
  const tail = parts[parts.length - 1].replace(/_/g, " ");
  return { verb: "other", label: tail };
}

function getTargetFromAction(action: string): string {
  const parts = action.split(".");
  return parts[0] ?? action;
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m}${ampm}`;
}

function formatDateHeader(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const dayLabel = isSameDay(date, today)
    ? "Today"
    : isSameDay(date, yesterday)
      ? "Yesterday"
      : `${months[date.getMonth()]} ${date.getDate()}`;

  return `${dayLabel} · ${months[date.getMonth()]} ${date.getDate()}`;
}

function isWithinDays(timestamp: number, days: number): boolean {
  return Date.now() - timestamp < days * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function computeStats(logs: AuditLogWithUser[]) {
  const sevenDayLogs = logs.filter((l) => isWithinDays(l.createdAt, 7));
  let events = sevenDayLogs.length;
  let reveals = 0;
  let rotations = 0;
  let shares = 0;

  for (const log of sevenDayLogs) {
    const { verb } = classifyAction(log.action);
    if (verb === "revealed") reveals++;
    if (verb === "rotated") rotations++;
    if (verb === "shared") shares++;
  }

  return { events, reveals, rotations, shares };
}

// ---------------------------------------------------------------------------
// Group logs by day
// ---------------------------------------------------------------------------

interface DayGroup {
  dateKey: string;
  label: string;
  items: AuditLogWithUser[];
}

function groupByDay(logs: AuditLogWithUser[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const log of logs) {
    const date = new Date(log.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        dateKey: key,
        label: formatDateHeader(log.createdAt),
        items: [],
      });
    }
    groups.get(key)!.items.push(log);
  }
  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

type FilterKey = "who" | "when" | "project";

interface FilterOption {
  key: FilterKey;
  label: string;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Env chip component
// ---------------------------------------------------------------------------

function EnvChip({ env }: { env: string }) {
  const dotColor =
    env === "production" || env === "prod"
      ? colors.red
      : env === "development" || env === "dev"
        ? colors.green
        : env === "staging" || env === "stg"
          ? colors.amber
          : colors.muted;

  const label =
    env === "production"
      ? "prod"
      : env === "development"
        ? "dev"
        : env === "staging"
          ? "stg"
          : env;

  return (
    <View style={styles.envChip}>
      <View style={[styles.envDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.envChipText, { color: dotColor }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timeline Item
// ---------------------------------------------------------------------------

const TimelineItem = React.memo(function TimelineItem({
  item,
  isLast,
}: {
  item: AuditLogWithUser;
  isLast: boolean;
}) {
  const { verb, label } = classifyAction(item.action);
  const actionColor = ACTION_COLORS[verb];
  const target = getTargetFromAction(item.action);
  const actorName = item.userName ?? item.userEmail ?? "Unknown";
  const details = item.parsedDetails as Record<string, string> | null;
  const projectName = details?.projectName ?? details?.project;
  const envName = details?.environment ?? details?.env;

  return (
    <View style={[styles.timelineRow, !isLast && styles.timelineRowBorder]}>
      {/* Time column */}
      <View style={styles.timeCol}>
        <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
      </View>

      {/* Content */}
      <View style={styles.timelineContent}>
        <Text style={styles.timelineText} numberOfLines={2}>
          <Text style={styles.actorName}>{actorName}</Text>
          {"  "}
          <Text style={[styles.actionVerb, { color: actionColor }]}>
            {label}
          </Text>
          {"  "}
          <Text style={styles.targetText}>{target}</Text>
        </Text>

        {/* Chips row */}
        {(projectName || envName) && (
          <View style={styles.chipsRow}>
            {projectName && (
              <View style={styles.projectChip}>
                <Text style={styles.projectChipText}>{projectName}</Text>
              </View>
            )}
            {envName && <EnvChip env={envName} />}
          </View>
        )}
      </View>

      {/* Chevron */}
      <View style={styles.chevronCol}>
        <Icon name="chev-r" size={14} color={colors.muted} />
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Stat Box
// ---------------------------------------------------------------------------

function StatBox({
  count,
  label,
  color: statColor,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statNumber, { color: statColor }]}>{count}</Text>
      <Text style={styles.statLabel}>
        {label}{" "}
        <Text style={styles.statPeriod}>· 7d</Text>
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ActivityScreen() {
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const [activeFilters] = useState<Set<FilterKey>>(new Set(["who", "when", "project"]));

  const auditLogs = useQuery(
    api.auditLogs.listByOrganization,
    activeOrgId ? { organizationId: activeOrgId, limit: 100 } : "skip"
  ) as AuditLogWithUser[] | undefined;

  const stats = useMemo(() => {
    if (!auditLogs) return { events: 0, reveals: 0, rotations: 0, shares: 0 };
    return computeStats(auditLogs);
  }, [auditLogs]);

  const dayGroups = useMemo(() => {
    if (!auditLogs) return [];
    return groupByDay(auditLogs);
  }, [auditLogs]);

  // Flatten for FlashList: interleave date headers + items
  const flatData = useMemo(() => {
    const result: Array<
      | { type: "header"; label: string; key: string }
      | { type: "item"; data: AuditLogWithUser; isLast: boolean; key: string }
    > = [];
    for (const group of dayGroups) {
      result.push({ type: "header", label: group.label, key: `h-${group.dateKey}` });
      group.items.forEach((item, i) => {
        result.push({
          type: "item",
          data: item,
          isLast: i === group.items.length - 1,
          key: item._id,
        });
      });
    }
    return result;
  }, [dayGroups]);

  const filters: FilterOption[] = [
    { key: "who", label: "everyone", active: activeFilters.has("who") },
    { key: "when", label: "this week", active: activeFilters.has("when") },
    { key: "project", label: "all projects", active: activeFilters.has("project") },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.cmdLine}>$ envpilot activity --org=tudo-tech-lab</Text>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>live</Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <StatBox count={stats.events} label="events" color={colors.textPrimary} />
        <StatBox count={stats.reveals} label="reveals" color={colors.amber} />
        <StatBox count={stats.rotations} label="rotations" color={colors.purple} />
        <StatBox count={stats.shares} label="shares" color={colors.blue} />
      </View>

      {/* Filter row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              f.active && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                f.active && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
            <Icon
              name="chev-d"
              size={12}
              color={f.active ? colors.green : colors.muted}
            />
          </Pressable>
        ))}
      </ScrollView>

      {/* Content */}
      {!activeOrgId ? (
        <EmptyState
          title="No organization selected"
          description="Select an organization from the Home tab to view activity."
          icon="◉"
        />
      ) : auditLogs === undefined ? (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : auditLogs.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Actions in your organization will appear here."
          icon="◉"
        />
      ) : (
        <FlashList
          data={flatData}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={styles.dateHeader}>
                  <Text style={styles.dateHeaderText}>
                    {item.label.toUpperCase()}
                  </Text>
                </View>
              );
            }
            return <TimelineItem item={item.data} isLast={item.isLast} />;
          }}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingBottom: 32 }}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flex: 1,
  },
  cmdLine: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.greenSoft,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  liveText: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.green,
  },

  // Stats strip
  statsStrip: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  statNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 18,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  statPeriod: {
    color: colors.muted,
  },

  // Filter row
  filterRow: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 6,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  filterChipActive: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBorder,
  },
  filterChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  filterChipTextActive: {
    color: colors.green,
  },

  // Date header
  dateHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dateHeaderText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1,
  },

  // Timeline
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timelineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timeCol: {
    width: 42,
    paddingTop: 1,
  },
  timeText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  timelineContent: {
    flex: 1,
  },
  timelineText: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    lineHeight: 18,
  },
  actorName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  actionVerb: {
    fontFamily: fonts.monoMedium,
    fontSize: 12.5,
  },
  targetText: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    color: colors.muted,
  },
  chevronCol: {
    paddingLeft: 8,
    paddingTop: 2,
  },

  // Chips
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  projectChip: {
    backgroundColor: colors.white04,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  projectChipText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.muted,
  },
  envChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.white04,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  envDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  envChipText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
  },

  // States
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.muted,
  },
});
