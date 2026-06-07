import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Icon } from "@/components/ui/Icon";
import { Sparkline } from "@/components/ui/Sparkline";
import { useAuthStore } from "@/stores/auth.store";
import { useAppStore } from "@/stores/app.store";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function getGreetingPeriod(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function getFormattedDate(): string {
  const now = new Date();
  const dayName = now
    .toLocaleDateString("en-US", { weekday: "long" })
    .toUpperCase();
  const month = now
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
  const day = now.getDate();
  return `${dayName}, ${month} ${day}`;
}

function getFirstName(name: string | null): string {
  if (!name) return "there";
  return name.split(" ")[0];
}

function getOrgInitial(name: string | undefined | null): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

// ── Environment card config ──────────────────────────────────────────

interface EnvConfig {
  name: string;
  icon: string;
  color: string;
  bgColor: string;
}

const ENV_CONFIGS: EnvConfig[] = [
  {
    name: "Production",
    icon: "rocket",
    color: colors.red,
    bgColor: "#221216",
  },
  { name: "Staging", icon: "box", color: colors.amber, bgColor: "#221c12" },
  {
    name: "Development",
    icon: "database",
    color: colors.green,
    bgColor: "#122218",
  },
];

// ── Sparkline mock data (simulating activity) ────────────────────────

const PROJECT_ICON_SETS = [
  { bg: "#fcd6d6", icon: "globe" },
  { bg: "#d6e8fc", icon: "database" },
  { bg: "#e0d6fc", icon: "cog" },
  { bg: "#d6fce0", icon: "folder" },
  { bg: "#fcf0d6", icon: "rocket" },
] as const;

const SPARK_PRODUCTION = [3, 5, 4, 7, 6, 8, 5, 9, 7, 6, 8, 10];
const SPARK_STAGING = [2, 3, 5, 4, 6, 5, 3, 4, 6, 5, 7, 6];
const SPARK_DEV = [4, 6, 8, 7, 5, 9, 11, 8, 10, 12, 9, 11];

// ── Component ────────────────────────────────────────────────────────

export default function HomeScreen() {
  const userId = useAuthStore((s) => s.userId);
  const userName = useAuthStore((s) => s.userName);
  const activeOrgId = useAppStore((s) => s.activeOrgId);

  const organizations = useQuery(
    api.organizations.listForUser,
    userId ? { userId } : "skip"
  );

  const activeOrg = organizations?.find((o) => o?._id === activeOrgId);

  const stats = useQuery(
    api.dashboard.getStats,
    activeOrgId ? { organizationId: activeOrgId } : "skip"
  );

  const recentProjects = useQuery(
    api.dashboard.getRecentProjects,
    activeOrgId ? { organizationId: activeOrgId } : "skip"
  );

  const totalVars = stats?.variables.total ?? 0;
  const pendingCount = stats?.pendingRequests.total ?? 0;
  const projectCount = stats?.projects.total ?? 0;

  // Distribute variables across environments for display
  const prodVars = Math.round(totalVars * 0.45);
  const stagingVars = Math.round(totalVars * 0.3);
  const devVars = totalVars - prodVars - stagingVars;

  const envVarCounts = [prodVars, stagingVars, devVars];
  const activeEnvCount = [prodVars, stagingVars, devVars].filter(
    (c) => c > 0
  ).length;

  const greeting = getGreetingPeriod();
  const dateStr = getFormattedDate();
  const firstName = getFirstName(userName);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <Pressable
            style={styles.orgPill}
            onPress={() => router.push("/(app)/organizations")}
          >
            <View style={styles.orgInitialCircle}>
              <Text style={styles.orgInitialText}>
                {getOrgInitial(activeOrg?.name)}
              </Text>
            </View>
            <Text style={styles.orgName} numberOfLines={1}>
              {activeOrg?.name ?? "Select Org"}
            </Text>
            <Icon name="chev-d" size={14} color={colors.muted} />
          </Pressable>

          <View style={styles.topBarRight}>
            <Pressable style={styles.iconCircle}>
              <Icon name="search" size={16} color={colors.muted} />
            </Pressable>
            <Pressable
              style={styles.iconCircle}
              onPress={() => router.push("/(app)/(tabs)/activity")}
            >
              <Icon name="bell" size={16} color={colors.muted} />
              {pendingCount > 0 && <View style={styles.notifDot} />}
            </Pressable>
          </View>
        </View>

        {/* ── Welcome editorial ───────────────────────────────────── */}
        <View style={styles.welcomeSection}>
          <Text style={styles.dateLabel}>{dateStr}</Text>
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingGood}>Good</Text>
            <Text style={styles.greetingPeriod}>{greeting},</Text>
            <Text style={styles.greetingName}>{firstName}.</Text>
          </View>
        </View>

        {/* ── Environments section ────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>ENVIRONMENTS</Text>
            <Text style={styles.sectionMeta}>
              {activeEnvCount} active · {totalVars} vars
            </Text>
          </View>

          {ENV_CONFIGS.map((env, idx) => {
            const varCount = envVarCounts[idx];
            const sparkData =
              idx === 0
                ? SPARK_PRODUCTION
                : idx === 1
                  ? SPARK_STAGING
                  : SPARK_DEV;
            const hasAlert = idx === 0 && pendingCount > 0;

            return (
              <View
                key={env.name}
                style={[
                  styles.envCard,
                  {
                    backgroundColor: env.bgColor,
                    borderColor: env.color + "33",
                  },
                ]}
              >
                {/* Radial glow effect (simulated with overlapping view) */}
                <View
                  style={[
                    styles.envGlow,
                    { backgroundColor: env.color + "22" },
                  ]}
                />

                <View style={styles.envCardInner}>
                  <View style={styles.envLeft}>
                    <View style={styles.envNameRow}>
                      <View
                        style={[
                          styles.envIconBox,
                          { backgroundColor: env.color + "22" },
                        ]}
                      >
                        <Icon name={env.icon} size={13} color={env.color} />
                      </View>
                      <Text style={[styles.envName, { color: env.color }]}>
                        {env.name.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.envVarCount}>{varCount}</Text>
                    <Text style={styles.envVarLabel}>variables</Text>
                  </View>

                  <View style={styles.envRight}>
                    {hasAlert && (
                      <View
                        style={[
                          styles.alertChip,
                          { backgroundColor: env.color + "22" },
                        ]}
                      >
                        <Text style={[styles.alertText, { color: env.color }]}>
                          ! {pendingCount} alert{pendingCount !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                    <Sparkline
                      data={sparkData}
                      color={env.color}
                      width={72}
                      height={28}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Needs you section ───────────────────────────────────── */}
        {pendingCount > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>
                NEEDS YOU · {pendingCount}
              </Text>
            </View>

            <View style={styles.needsYouCard}>
              <View style={styles.needsYouTopRow}>
                <View style={styles.needsYouDot} />
                <Text style={styles.needsYouType}>APPROVAL</Text>
                <Text style={styles.needsYouTime}>14m</Text>
              </View>
              <Text style={styles.needsYouTitle}>
                Hammad wants production access to{" "}
                <Text style={styles.needsYouVar}>STRIPE_SECRET</Text>
              </Text>
              <View style={styles.needsYouActions}>
                <Pressable style={styles.approveBtn}>
                  <Text style={styles.approveBtnText}>Approve · 1h</Text>
                </Pressable>
                <Pressable style={styles.denyBtn}>
                  <Text style={styles.denyBtnText}>Deny</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* ── Recent projects ─────────────────────────────────────── */}
        {recentProjects && recentProjects.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>RECENT PROJECTS</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.projectsScroll}
            >
              {recentProjects.map((project, idx) => {
                const iconSet = PROJECT_ICON_SETS[idx % PROJECT_ICON_SETS.length];
                return (
                  <Pressable
                    key={project._id}
                    style={styles.projectCard}
                    onPress={() =>
                      router.push(`/(app)/projects/${project._id}`)
                    }
                  >
                    <View
                      style={[
                        styles.projectIconBox,
                        { backgroundColor: iconSet.bg },
                      ]}
                    >
                      <Icon name={iconSet.icon} size={16} color="#0a0d0b" />
                    </View>
                    <Text style={styles.projectName} numberOfLines={1}>
                      {project.name}
                    </Text>
                    <Text style={styles.projectVarCount}>
                      {project.variableCount} vars
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Quick stats row ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>OVERVIEW</Text>
          </View>

          <View style={styles.quickStatsRow}>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatValue}>{projectCount}</Text>
              <Text style={styles.quickStatLabel}>Projects</Text>
            </View>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatValue}>{totalVars}</Text>
              <Text style={styles.quickStatLabel}>Variables</Text>
            </View>
            <View style={styles.quickStatCard}>
              <Text style={styles.quickStatValue}>
                {stats?.team.total ?? 0}
              </Text>
              <Text style={styles.quickStatLabel}>Members</Text>
            </View>
          </View>
        </View>

        {/* ── Empty state ─────────────────────────────────────────── */}
        {organizations && organizations.length === 0 && (
          <View style={styles.emptyState}>
            <Icon name="logo" size={32} color={colors.muted} />
            <Text style={styles.emptyTitle}>No organizations</Text>
            <Text style={styles.emptyDesc}>
              Create one on the web to get started.
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 10,
  },

  // ── Top bar ──────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  orgPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    gap: 8,
    maxWidth: SCREEN_WIDTH * 0.55,
  },
  orgInitialCircle: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "#2a3a31",
    alignItems: "center",
    justifyContent: "center",
  },
  orgInitialText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  orgName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#e85a5a",
    borderWidth: 2,
    borderColor: colors.bg,
  },

  // ── Welcome ──────────────────────────
  welcomeSection: {
    marginBottom: 28,
  },
  dateLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  greetingBlock: {
    gap: 0,
  },
  greetingGood: {
    fontFamily: fonts.sansBold,
    fontSize: 50,
    color: colors.textPrimary,
    letterSpacing: -2,
    lineHeight: 50,
  },
  greetingPeriod: {
    fontFamily: fonts.sansBold,
    fontSize: 50,
    color: colors.muted,
    letterSpacing: -2,
    lineHeight: 50,
  },
  greetingName: {
    fontFamily: fonts.sansBold,
    fontSize: 50,
    color: colors.green,
    letterSpacing: -2,
    lineHeight: 50,
  },

  // ── Section ──────────────────────────
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sectionMeta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.green,
  },
  seeAll: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.green,
  },

  // ── Environment cards ────────────────
  envCard: {
    borderRadius: 18,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  envGlow: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  envCardInner: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  envLeft: {
    flexShrink: 1,
  },
  envNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  envIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  envName: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  envVarCount: {
    fontFamily: fonts.sansBold,
    fontSize: 38,
    color: colors.textPrimary,
    lineHeight: 38,
    letterSpacing: -1.1,
    marginTop: 8,
  },
  envVarLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  envRight: {
    alignItems: "flex-end",
    gap: 10,
  },
  alertChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  alertText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
  },

  // ── Needs you ────────────────────────
  needsYouCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
  },
  needsYouTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  needsYouDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.amber,
  },
  needsYouType: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.amber,
    letterSpacing: 0.8,
  },
  needsYouTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginLeft: "auto",
  },
  needsYouTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 10,
    lineHeight: 22,
  },
  needsYouVar: {
    fontFamily: fonts.mono,
    color: colors.amber,
  },
  needsYouActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  approveBtn: {
    flex: 1,
    padding: 11,
    backgroundColor: colors.green,
    borderRadius: 11,
    alignItems: "center",
  },
  approveBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: "#02110a",
  },
  denyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    alignItems: "center",
  },
  denyBtnText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 12,
    color: colors.textPrimary,
  },

  // ── Recent projects ──────────────────
  projectsScroll: {
    gap: 10,
    paddingRight: 20,
  },
  projectCard: {
    minWidth: 170,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  projectIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  projectName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  projectVarCount: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },

  // ── Quick stats ──────────────────────
  quickStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  quickStatValue: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  quickStatLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.5,
  },

  // ── Empty state ──────────────────────
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  emptyDesc: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },

  // ── Misc ─────────────────────────────
  bottomSpacer: {
    height: 32,
  },
});
