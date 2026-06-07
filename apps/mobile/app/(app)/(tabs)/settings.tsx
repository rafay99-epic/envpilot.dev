import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Application from "expo-application";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/stores/auth.store";
import { revokeToken } from "@/api/auth";

interface SettingsRowProps {
  icon: string;
  label: string;
  value?: string;
  isLast?: boolean;
  isRed?: boolean;
  onPress?: () => void;
}

function SettingsRow({ icon, label, value, isLast, isRed, onPress }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.settingsRow,
        !isLast && styles.settingsRowBorder,
      ]}
    >
      <View style={styles.rowLeft}>
        <Icon name={icon} size={15} color={isRed ? colors.red : colors.muted} />
        <Text style={[styles.rowLabel, isRed && styles.rowLabelRed]}>
          {label}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={styles.rowValue}>{value}</Text>
        ) : null}
        <Icon name="chev-r" size={14} color={colors.muted} />
      </View>
    </Pressable>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const userEmail = useAuthStore((s) => s.userEmail);
  const userName = useAuthStore((s) => s.userName);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const appVersion = Application.nativeApplicationVersion ?? "0.0.1";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await revokeToken();
          await clearAuth();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* CmdHead */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.cmdPrompt}>$ envpilot whoami</Text>
          <Text style={styles.headerTitle}>More</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <View style={styles.profileCard}>
          <Avatar
            name={userName ?? "User"}
            color={colors.green}
            size={48}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {userName ?? "User"}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {userEmail ?? "—"}
            </Text>
          </View>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>admin · tudo-tech-lab</Text>
          </View>
        </View>

        {/* Workspace */}
        <Section label="WORKSPACE">
          <SettingsRow icon="users" label="Team" value="5 members" />
          <SettingsRow icon="globe" label="SSO / SAML" value="Okta" />
          <SettingsRow icon="cog" label="Workspace settings" isLast />
        </Section>

        {/* Security */}
        <Section label="SECURITY">
          <SettingsRow icon="fingerprint" label="Biometric unlock" value="On" />
          <SettingsRow icon="lock" label="Auto-lock vaults" value="5 min idle" />
          <SettingsRow icon="shield" label="Recovery codes" value="5 unused" isLast />
        </Section>

        {/* Notifications */}
        <Section label="NOTIFICATIONS">
          <SettingsRow icon="flame" label="Anomaly alerts" value="Push + Email" />
          <SettingsRow icon="lock" label="Approval requests" value="Push" />
          <SettingsRow icon="pulse" label="Weekly digest" value="Mon 9AM" isLast />
        </Section>

        {/* About */}
        <Section label="ABOUT">
          <SettingsRow icon="logo" label="Version" value={appVersion} />
          <SettingsRow
            icon="arrow-r"
            label="Sign out"
            isLast
            isRed
            onPress={handleSignOut}
          />
        </Section>

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

  /* Scroll */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  bottomSpacer: {
    height: 40,
  },

  /* Profile card */
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  profileName: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  profileEmail: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  roleChip: {
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleChipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.green,
  },

  /* Section */
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },

  /* Settings row */
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  settingsRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  rowLabelRed: {
    color: colors.red,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
});
