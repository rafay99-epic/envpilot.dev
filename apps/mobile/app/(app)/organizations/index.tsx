import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Icon } from "@/components/ui/Icon";
import { useAuthStore } from "@/stores/auth.store";
import { useAppStore } from "@/stores/app.store";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import type { Id } from "convex/_generated/dataModel";
import React from "react";

interface OrgWithRole {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  role: string;
}

const OrgItem = React.memo(function OrgItem({
  item,
  isActive,
  onSelect,
}: {
  item: OrgWithRole;
  isActive: boolean;
  onSelect: () => void;
}) {
  const initial = item.name.charAt(0).toUpperCase();
  const roleLabel =
    item.role === "team_lead" ? "Team Lead" : item.role.charAt(0).toUpperCase() + item.role.slice(1);

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.orgCard,
        isActive ? styles.orgCardActive : styles.orgCardInactive,
        pressed && styles.orgCardPressed,
      ]}
    >
      <View style={styles.orgCardInner}>
        {/* Avatar */}
        <View style={[styles.avatar, isActive && styles.avatarActive]}>
          <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>
            {initial}
          </Text>
        </View>

        {/* Center content */}
        <View style={styles.orgInfo}>
          <View style={styles.orgNameRow}>
            <Text
              style={[
                styles.orgName,
                isActive && styles.orgNameActive,
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {isActive ? (
              <View style={styles.currentChip}>
                <Text style={styles.currentChipText}>current</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.orgMeta} numberOfLines={1}>
            {roleLabel} · {item.slug}
          </Text>
        </View>

        {/* Chevron */}
        <Icon
          name="chev-r"
          size={18}
          color={isActive ? colors.green : colors.muted}
        />
      </View>
    </Pressable>
  );
});

export default function OrganizationsScreen() {
  const userId = useAuthStore((s) => s.userId);
  const userName = useAuthStore((s) => s.userName);
  const activeOrgId = useAppStore((s) => s.activeOrgId);
  const setActiveOrg = useAppStore((s) => s.setActiveOrg);

  const organizations = useQuery(
    api.organizations.listForUser,
    userId ? { userId } : "skip"
  );

  const handleSelect = async (orgId: Id<"organizations">) => {
    await setActiveOrg(orgId);
    router.back();
  };

  const firstName = userName?.split(" ")[0] ?? "User";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.terminalPrompt}>$ envpilot orgs</Text>
        <Text style={styles.welcomeText}>Welcome, {firstName}</Text>
        <Text style={styles.headerDescription}>
          Choose an organization to continue. Each has its own projects,
          activity log and anomaly stream.
        </Text>
      </View>

      {/* Section label */}
      <View style={styles.sectionLabelContainer}>
        <Text style={styles.sectionLabel}>YOUR ORGANIZATIONS</Text>
      </View>

      {/* Org list */}
      {organizations === undefined ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading organizations...</Text>
        </View>
      ) : (
        <FlashList
          data={organizations as OrgWithRole[]}
          renderItem={({ item }) => (
            <OrgItem
              item={item}
              isActive={item._id === activeOrgId}
              onSelect={() => handleSelect(item._id)}
            />
          )}
          estimatedItemSize={80}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No organizations found. Create one to get started.
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              {/* Create new org */}
              <Pressable
                style={({ pressed }) => [
                  styles.createButton,
                  pressed && styles.createButtonPressed,
                ]}
              >
                <Icon name="plus" size={16} color={colors.green} />
                <Text style={styles.createButtonText}>
                  Create new organization
                </Text>
              </Pressable>

              {/* Join via invite */}
              <Pressable
                style={({ pressed }) => [
                  styles.joinButton,
                  pressed && styles.joinButtonPressed,
                ]}
              >
                <Icon name="send" size={14} color={colors.muted} />
                <Text style={styles.joinButtonText}>Join via invite code</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 6,
  },
  terminalPrompt: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  welcomeText: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerDescription: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 8,
  },
  sectionLabelContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.muted,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  orgCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  orgCardActive: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBorder,
  },
  orgCardInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  orgCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  orgCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarActive: {
    backgroundColor: "rgba(30,224,122,0.2)",
  },
  avatarText: {
    fontFamily: fonts.sansBold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  avatarTextActive: {
    color: colors.green,
  },
  orgInfo: {
    flex: 1,
    gap: 3,
  },
  orgNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orgName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  orgNameActive: {
    color: colors.green,
  },
  currentChip: {
    backgroundColor: colors.greenSoft,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 5,
  },
  currentChipText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.green,
  },
  orgMeta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
  footer: {
    marginTop: 8,
    gap: 10,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border2,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  createButtonPressed: {
    backgroundColor: colors.surface,
  },
  createButtonText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.green,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  joinButtonPressed: {
    opacity: 0.7,
  },
  joinButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.muted,
  },
});
