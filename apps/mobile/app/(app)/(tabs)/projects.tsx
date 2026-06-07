import { useState, useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { useAppStore } from "@/stores/app.store";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import type { Doc } from "convex/_generated/dataModel";
import React from "react";

const PROJECT_ICONS: { bg: string; icon: string }[] = [
  { bg: "#fcd6d6", icon: "globe" },
  { bg: "#d6e8fc", icon: "database" },
  { bg: "#e0d6fc", icon: "cog" },
  { bg: "#d6fce0", icon: "folder" },
  { bg: "#fcf0d6", icon: "rocket" },
  { bg: "#d6f5fc", icon: "box" },
];

function getIconSet(index: number) {
  return PROJECT_ICONS[index % PROJECT_ICONS.length];
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function getUniqueEnvironments(envs: string[]): string[] {
  const unique = new Set(envs);
  const order = ["production", "staging", "development"];
  return order.filter((e) => unique.has(e));
}

function envColor(env: string): string {
  switch (env) {
    case "production":
      return colors.red;
    case "staging":
      return colors.amber;
    case "development":
      return colors.green;
    default:
      return colors.muted;
  }
}

function envShort(env: string): string {
  switch (env) {
    case "production":
      return "prod";
    case "staging":
      return "stg";
    case "development":
      return "dev";
    default:
      return env.slice(0, 4);
  }
}

interface ProjectItemProps {
  item: Doc<"projects">;
  index: number;
  variables?: Doc<"environmentVariables">[];
}

const ProjectItem = React.memo(function ProjectItem({
  item,
  index,
  variables,
}: ProjectItemProps) {
  const iconSet = getIconSet(index);
  const projectIcon = item.icon ?? iconSet.icon;
  const envs = variables
    ? getUniqueEnvironments(variables.flatMap((v) => v.environments))
    : [];
  const varCount = variables?.length ?? 0;

  return (
    <Pressable
      onPress={() => router.push(`/(app)/projects/${item._id}`)}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Top row: icon + name/meta + chevron */}
      <View style={styles.cardTopRow}>
        <View style={[styles.iconSquare, { backgroundColor: iconSet.bg }]}>
          <Icon name={projectIcon} size={18} color="#0a0d0b" />
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.projectName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description?.toLowerCase().includes("locked") && (
              <Icon name="lock" size={13} color={colors.amber} />
            )}
          </View>
          <Text style={styles.projectSlug} numberOfLines={1}>
            {item.slug}
            {varCount > 0 ? ` · ${varCount} vars` : ""}
            {envs.length > 0 ? ` · ${envs.length} envs` : ""}
          </Text>
        </View>

        <Icon name="chev-r" size={16} color={colors.muted} />
      </View>

      {/* Bottom row: env chips + last edit */}
      <View style={styles.cardBottomRow}>
        <View style={styles.envChips}>
          {envs.map((env) => {
            const c = envColor(env);
            return (
              <View
                key={env}
                style={[styles.envChip, { backgroundColor: c + "1F" }]}
              >
                <Text style={[styles.envChipText, { color: c }]}>
                  {"●"} {envShort(env)}
                </Text>
              </View>
            );
          })}
        </View>
        {item.updatedAt > 0 && (
          <Text style={styles.lastEdit}>
            last edit {formatRelativeTime(item.updatedAt)}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

export default function ProjectsScreen() {
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const [search, setSearch] = useState("");

  const projects = useQuery(
    api.projects.listByOrganization,
    activeOrgId ? { organizationId: activeOrgId } : "skip"
  );

  const allVariables = useQuery(
    api.variables.listByOrganization,
    activeOrgId ? { organizationId: activeOrgId } : "skip"
  );

  const variablesByProject = useMemo(() => {
    if (!allVariables) return new Map<string, Doc<"environmentVariables">[]>();
    const map = new Map<string, Doc<"environmentVariables">[]>();
    for (const v of allVariables) {
      const key = v.projectId as string;
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    return map;
  }, [allVariables]);

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [projects, search]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* CmdHead — no bottom border */}
        <View style={styles.header}>
          <Text style={styles.cmdLine}>$ envpilot projects ls</Text>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>Projects</Text>
            <Pressable
              style={({ pressed }) => [
                styles.newButton,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon name="plus" size={14} color="#02110a" />
              <Text style={styles.newButtonText}>New</Text>
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Icon name="search" size={16} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="filter projects…"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Project list */}
        {!activeOrgId ? (
          <EmptyState
            title="No organization selected"
            description="Select an organization from the Home tab to view projects."
            icon="◈"
          />
        ) : projects === undefined ? (
          <View style={styles.centered}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : filtered.length === 0 ? (
          search.trim() ? (
            <EmptyState
              title="No matches"
              description={`No projects matching "${search}".`}
              icon="◈"
            />
          ) : (
            <EmptyState
              title="No projects yet"
              description="Create a project on the web to get started."
              icon="◈"
            />
          )
        ) : (
          <View style={styles.cardsWrap}>
            {filtered.map((item, index) => (
              <ProjectItem
                key={item._id}
                item={item}
                index={index}
                variables={variablesByProject.get(item._id as string)}
              />
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  // CmdHead
  header: {
    paddingTop: 8,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  cmdLine: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.green,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: "#02110a",
  },

  // Search
  searchWrap: {
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textPrimary,
    padding: 0,
  },

  // Cards container
  cardsWrap: {
    paddingHorizontal: 14,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  projectName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  projectSlug: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },

  // Bottom row
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  envChips: {
    flexDirection: "row",
    gap: 6,
  },
  envChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  envChipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
  },
  lastEdit: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },

  // States
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.muted,
  },
});
