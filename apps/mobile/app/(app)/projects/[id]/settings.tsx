import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Icon } from "@/components/ui/Icon";
import { MonoCard } from "@/components/ui/MonoCard";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

const SETTINGS_ITEMS: { icon: string; label: string; valueKey: string }[] = [
  { icon: "globe", label: "Project name", valueKey: "name" },
  { icon: "cog", label: "Slug", valueKey: "slug" },
  { icon: "box", label: "Environments", valueKey: "environments" },
  { icon: "rocket", label: "Auto-rotation", valueKey: "rotation" },
  { icon: "github", label: "Connected repo", valueKey: "repo" },
];

export default function ProjectSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useQuery(api.projects.getById, { projectId: id as Id<"projects"> });

  const settingsValues: Record<string, string> = {
    name: project?.name ?? "—",
    slug: project?.slug ?? "—",
    environments: "development, staging, production",
    rotation: "Disabled",
    repo: "—",
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-l" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTextGroup}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSub}>{project?.slug ?? "project"}</Text>
        </View>
      </View>

      {/* Sub tabs */}
      <View style={styles.subTabRow}>
        {(["variables", "members", "settings"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.subTab, tab === "settings" && styles.subTabActive]}
            onPress={() => {
              if (tab === "variables") router.replace(`/projects/${id}`);
            }}
          >
            <Text
              style={[
                styles.subTabText,
                tab === "settings" && styles.subTabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Vault unlock */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Vault</Text>
        </View>

        <View style={styles.vaultCard}>
          <View style={styles.vaultGlow} />
          <View style={styles.vaultIconWrap}>
            <View style={styles.vaultIconOuter}>
              <View style={styles.vaultIconInner}>
                <Icon name="fingerprint" size={26} color="#02110a" />
              </View>
            </View>
          </View>
          <Text style={styles.vaultTitle}>Unlock project vault</Text>
          <Text style={styles.vaultDesc}>
            Authenticate with biometrics to reveal the sensitive variables in
            this project.
          </Text>
          <Pressable style={styles.vaultButton}>
            <Text style={styles.vaultButtonText}>$ vault unlock --bio</Text>
          </Pressable>
          <Text style={styles.vaultNote}>
            # auto-relocks after 5 minutes idle
          </Text>
        </View>

        {/* General settings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>General</Text>
        </View>

        <View style={styles.settingsList}>
          {SETTINGS_ITEMS.map((item, idx) => (
            <View
              key={item.label}
              style={[
                styles.settingsRow,
                idx < SETTINGS_ITEMS.length - 1 && styles.settingsRowBorder,
              ]}
            >
              <Icon name={item.icon} size={16} color={colors.muted} />
              <View style={styles.settingsRowText}>
                <Text style={styles.settingsLabel}>{item.label}</Text>
                <Text style={styles.settingsValue} numberOfLines={1}>
                  {settingsValues[item.valueKey]}
                </Text>
              </View>
              <Icon name="chev-r" size={14} color={colors.muted} />
            </View>
          ))}
        </View>

        {/* Delete button */}
        <Pressable style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete project</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerSub: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  subTabRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginHorizontal: 8,
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
    fontFamily: fonts.monoSemibold,
    fontSize: 12,
    color: colors.muted,
  },
  subTabTextActive: {
    color: colors.green,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 18,
  },
  sectionHeader: {
    paddingHorizontal: 22,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  vaultCard: {
    marginHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 18,
  },
  vaultGlow: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(30,224,122,0.18)",
  },
  vaultIconWrap: {
    marginBottom: 12,
  },
  vaultIconOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  vaultIconInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  vaultTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  vaultDesc: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 18,
  },
  vaultButton: {
    width: "100%",
    padding: 13,
    backgroundColor: colors.green,
    borderRadius: 11,
    alignItems: "center",
  },
  vaultButtonText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: "#02110a",
  },
  vaultNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 8,
  },
  settingsList: {
    marginHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingsRowText: {
    flex: 1,
    minWidth: 0,
  },
  settingsLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  settingsValue: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },
  deleteButton: {
    marginHorizontal: 14,
    padding: 13,
    backgroundColor: "rgba(232,90,90,0.04)",
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 12,
    alignItems: "center",
  },
  deleteButtonText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.red,
  },
});
