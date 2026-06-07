import { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import { decryptValue } from "@/api/vault";
import type { Id, Doc } from "convex/_generated/dataModel";
import React from "react";
import * as Clipboard from "expo-clipboard"; // run: bunx expo install expo-clipboard

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENVIRONMENTS = ["all", "development", "staging", "production"] as const;
const SUB_TABS = ["variables", "members", "settings"] as const;

const PROJECT_ICON_COLORS = [
  { bg: "#d6fce0", icon: "#27ae60" },
  { bg: "#d6e8fc", icon: "#2980b9" },
  { bg: "#e0d6fc", icon: "#8e44ad" },
  { bg: "#fcd6d6", icon: "#c0392b" },
  { bg: "#fcf0d6", icon: "#e67e22" },
  { bg: "#d6f5fc", icon: "#16a085" },
] as const;

function getProjectColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PROJECT_ICON_COLORS[Math.abs(hash) % PROJECT_ICON_COLORS.length];
}

function envShortLabel(env: string): string {
  switch (env) {
    case "development":
      return "dev";
    case "staging":
      return "stg";
    case "production":
      return "prod";
    default:
      return env.slice(0, 4);
  }
}

// ---------------------------------------------------------------------------
// VariableRow
// ---------------------------------------------------------------------------

interface VariableRowProps {
  item: Doc<"environmentVariables">;
  projectId: string;
}

const VariableRow = React.memo(function VariableRow({
  item,
  projectId,
}: VariableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const isSensitive = item.isSensitive;

  const handleToggleReveal = useCallback(async () => {
    if (expanded && revealedValue) {
      // Collapse
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setExpanded(false);
        setRevealedValue(null);
      });
      return;
    }
    setExpanded(true);
    setRevealing(true);
    const value = await decryptValue(item.vaultRef);
    setRevealedValue(value);
    setRevealing(false);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, revealedValue, item.vaultRef, fadeAnim]);

  const handleCopy = useCallback(async () => {
    if (revealedValue) {
      await Clipboard.setStringAsync(revealedValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [revealedValue]);

  const handleNavigate = useCallback(() => {
    router.push(`/(app)/projects/${projectId}/variables/${item._id}`);
  }, [projectId, item._id]);

  return (
    <View style={styles.varCard}>
      <Pressable
        onPress={handleNavigate}
        style={styles.varCardInner}
      >
        {/* Left icon */}
        <View style={styles.varIconWrap}>
          <Icon
            name={isSensitive ? "lock" : "key"}
            size={14}
            color={isSensitive ? colors.amber : colors.green}
          />
        </View>

        {/* Key + chips */}
        <View style={styles.varContent}>
          <Text style={styles.varKey} numberOfLines={1}>
            {item.key}
          </Text>
          <View style={styles.varChips}>
            {item.environments.slice(0, 2).map((env) => (
              <View key={env} style={styles.envMiniChip}>
                <Text style={styles.envMiniChipText}>{envShortLabel(env)}</Text>
              </View>
            ))}
            <View style={styles.versionChip}>
              <Text style={styles.versionChipText}>v{item.version}</Text>
            </View>
          </View>
        </View>

        {/* Eye toggle */}
        <Pressable
          onPress={handleToggleReveal}
          hitSlop={12}
          style={styles.eyeButton}
        >
          {revealing ? (
            <ActivityIndicator size="small" color={colors.green} />
          ) : (
            <Icon
              name={expanded ? "eye" : "eye-off"}
              size={16}
              color={expanded ? colors.green : colors.muted}
            />
          )}
        </Pressable>
      </Pressable>

      {/* Expanded value */}
      {expanded && (
        <Animated.View style={[styles.expandedSection, { opacity: fadeAnim }]}>
          <View style={styles.expandedValueBox}>
            <Text style={styles.expandedValue} selectable>
              {revealedValue ?? "decrypting..."}
            </Text>
          </View>
          <View style={styles.expandedActions}>
            <Pressable onPress={handleCopy} style={styles.actionChip}>
              <Icon name={copied ? "check" : "copy"} size={12} color={colors.green} />
              <Text style={styles.actionChipText}>
                {copied ? "copied" : "copy"}
              </Text>
            </Pressable>
            <Pressable style={styles.actionChip}>
              <Icon name="share" size={12} color={colors.green} />
              <Text style={styles.actionChipText}>share</Text>
            </Pressable>
            <Pressable
              onPress={handleNavigate}
              style={styles.actionChip}
            >
              <Icon name="cog" size={12} color={colors.green} />
              <Text style={styles.actionChipText}>edit</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = id as Id<"projects">;
  const [activeEnv, setActiveEnv] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("variables");

  const project = useQuery(api.projects.getById, { projectId });

  const variables = useQuery(api.variables.listByProject, {
    projectId,
    environment: activeEnv === "all" ? undefined : activeEnv,
  });

  const colorScheme = project ? getProjectColor(project.name) : PROJECT_ICON_COLORS[0];
  const varCount = variables?.length ?? 0;

  const envCounts = useMemo(() => {
    if (!variables) return {};
    const counts: Record<string, number> = {};
    for (const v of variables) {
      for (const env of v.environments) {
        counts[env] = (counts[env] ?? 0) + 1;
      }
    }
    return counts;
  }, [variables]);

  const allVars = useQuery(api.variables.listByProject, { projectId });
  const totalCount = allVars?.length ?? 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="arrow-l" size={20} color={colors.textPrimary} />
          </Pressable>
          <View style={[styles.projectIcon, { backgroundColor: colorScheme.bg }]}>
            <Icon
              name={project?.icon ?? "folder"}
              size={18}
              color={colorScheme.icon}
            />
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {project?.name ?? "Loading..."}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {project?.slug ?? "..."} · {totalCount} vars
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() =>
            router.push(`/(app)/projects/${projectId}` as never)
          }
          hitSlop={12}
          style={styles.cogButton}
        >
          <Icon name="cog" size={18} color={colors.muted} />
        </Pressable>
      </View>

      {/* ---- Sub-tabs ---- */}
      <View style={styles.subTabs}>
        {SUB_TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.subTab,
              activeTab === tab && styles.subTabActive,
            ]}
          >
            <Text
              style={[
                styles.subTabText,
                activeTab === tab && styles.subTabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ---- Env Switcher ---- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.envSwitcherContent}
        style={styles.envSwitcher}
      >
        {ENVIRONMENTS.map((env) => {
          const isActive = activeEnv === env;
          const count =
            env === "all"
              ? totalCount
              : envCounts[env] ?? 0;
          return (
            <Pressable
              key={env}
              onPress={() => setActiveEnv(env)}
              style={[
                styles.envChip,
                isActive && styles.envChipActive,
              ]}
            >
              <Text
                style={[
                  styles.envChipText,
                  isActive && styles.envChipTextActive,
                ]}
              >
                {env === "all" ? "all" : envShortLabel(env)}
              </Text>
              {count > 0 && (
                <Text
                  style={[
                    styles.envChipCount,
                    isActive && styles.envChipCountActive,
                  ]}
                >
                  {count}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ---- Command line ---- */}
      <View style={styles.cmdRow}>
        <Text style={styles.cmdText}>
          $ vars list{activeEnv !== "all" ? ` --env=${envShortLabel(activeEnv)}` : ""}
        </Text>
        <Pressable
          onPress={() =>
            router.push(`/(app)/projects/${projectId}/variables/new` as never)
          }
          style={styles.addChip}
        >
          <Icon name="plus" size={12} color={colors.green} />
          <Text style={styles.addChipText}>add</Text>
        </Pressable>
      </View>

      {/* ---- Variable List ---- */}
      {variables === undefined ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.green} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : variables.length === 0 ? (
        <EmptyState
          title="No variables"
          description={`No variables in ${activeEnv === "all" ? "this project" : activeEnv} environment.`}
          icon="{ }"
        />
      ) : (
        <FlashList
          data={variables}
          renderItem={({ item }) => (
            <VariableRow item={item} projectId={id} />
          )}
          estimatedItemSize={72}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
          keyExtractor={(item) => item._id}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  projectIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMeta: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  cogButton: {
    padding: 6,
  },

  // Sub-tabs
  subTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
  },
  subTab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  subTabActive: {
    borderBottomColor: colors.green,
  },
  subTabText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.muted,
    textTransform: "lowercase",
  },
  subTabTextActive: {
    color: colors.green,
  },

  // Env switcher
  envSwitcher: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  envSwitcherContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  envChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  envChipActive: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBorder,
  },
  envChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  envChipTextActive: {
    color: colors.green,
  },
  envChipCount: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    backgroundColor: colors.white04,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  envChipCountActive: {
    color: colors.green,
    backgroundColor: "rgba(30,224,122,0.1)",
  },

  // Command line
  cmdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cmdText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  addChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.greenBorder,
  },
  addChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.green,
  },

  // Variable card
  varCard: {
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  varCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  varIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.white04,
    alignItems: "center",
    justifyContent: "center",
  },
  varContent: {
    flex: 1,
  },
  varKey: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  varChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  envMiniChip: {
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  envMiniChipText: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.green,
  },
  versionChip: {
    backgroundColor: colors.white04,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  versionChipText: {
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.muted,
  },
  eyeButton: {
    padding: 4,
  },

  // Expanded
  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "rgba(30,224,122,0.04)",
    padding: 12,
  },
  expandedValueBox: {
    backgroundColor: colors.black30,
    borderRadius: 8,
    padding: 10,
  },
  expandedValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.green,
    lineHeight: 20,
  },
  expandedActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionChipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.green,
  },

  // States
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.muted,
  },
});
