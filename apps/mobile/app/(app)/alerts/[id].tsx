import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Icon } from "@/components/ui/Icon";
import { MonoCard } from "@/components/ui/MonoCard";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

const ATTEMPTS = [
  { time: "09:41:02", event: "wrong OTP", color: colors.red },
  { time: "09:41:08", event: "wrong OTP", color: colors.red },
  { time: "09:41:14", event: "wrong OTP", color: colors.red },
  { time: "09:41:19", event: "wrong OTP", color: colors.red },
  { time: "09:41:24", event: "rate-limited", color: colors.amber },
  { time: "09:41:30", event: "link paused", color: colors.green },
];

export default function AnomalyDetailScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-l" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>SECURITY · LIVE</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Red gradient overlay effect */}
        <View style={styles.redGlow} />

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.orgLabel}>tudo-tech-lab · org event</Text>
          <Text style={styles.title}>Brute-force attempt on a share link</Text>
          <Text style={styles.subtitle}>
            5 OTP attempts in 30 seconds from a new IP. We paused the link and
            notified all admins.
          </Text>
        </View>

        {/* Attempts timeline */}
        <View style={styles.cardsContainer}>
          <MonoCard title="attempts — last 30s">
            <View style={styles.cardInner}>
              {ATTEMPTS.map((attempt, i) => (
                <View
                  key={i}
                  style={[
                    styles.attemptRow,
                    i < ATTEMPTS.length - 1 && styles.attemptRowBorder,
                  ]}
                >
                  <Text style={styles.attemptTime}>{attempt.time}</Text>
                  <View
                    style={[styles.attemptDot, { backgroundColor: attempt.color }]}
                  />
                  <Text style={[styles.attemptEvent, { color: attempt.color }]}>
                    {attempt.event}
                  </Text>
                </View>
              ))}
            </View>
          </MonoCard>

          {/* Source */}
          <MonoCard title="source">
            <View style={styles.sourceRow}>
              <View style={styles.sourceIconWrap}>
                <Icon name="globe" size={26} color={colors.red} />
                <View style={styles.sourcePulseDot} />
              </View>
              <View style={styles.sourceInfo}>
                <Text style={styles.sourceLocation}>Singapore, SG</Text>
                <Text style={styles.sourceIp}>
                  154.192.128.47 · iOS Safari
                </Text>
                <Text style={styles.sourceTor}>● Tor exit node</Text>
              </View>
            </View>
          </MonoCard>

          {/* Affected share link */}
          <MonoCard title="affected — share link">
            <View style={styles.affectedInner}>
              <Text style={styles.affectedKey}>
                VITE_GOOGLE_MAPS_API_KEY
              </Text>
              <View style={styles.affectedChips}>
                <View style={styles.chipMuted}>
                  <Text style={styles.chipMutedText}>react-web-app</Text>
                </View>
                <View style={styles.chipGreen}>
                  <Text style={styles.chipGreenText}>development</Text>
                </View>
                <View style={styles.chipMuted}>
                  <Text style={styles.chipMutedText}>sent → umaidnaeem</Text>
                </View>
              </View>
            </View>
          </MonoCard>

          {/* Action buttons */}
          <View style={styles.actionsContainer}>
            <Pressable style={styles.revokeBtn}>
              <Icon name="x" size={14} color="#fff" />
              <Text style={styles.revokeBtnText}>Permanently revoke link</Text>
            </Pressable>
            <Pressable style={styles.rotateBtn}>
              <Icon name="rocket" size={14} color={colors.green} />
              <Text style={styles.rotateBtnText}>Rotate the variable</Text>
            </Pressable>
            <Pressable style={styles.safeBtn}>
              <Text style={styles.safeBtnText}>
                Mark as safe (this was me)
              </Text>
            </Pressable>
          </View>
        </View>
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
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(232,90,90,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.red,
  },
  liveBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.red,
    letterSpacing: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  redGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: "rgba(232,90,90,0.18)",
  },
  titleBlock: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 4,
  },
  orgLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 30,
    color: colors.textPrimary,
    letterSpacing: -0.6,
    marginTop: 8,
    lineHeight: 32 * 1.05,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 20,
  },
  cardsContainer: {
    paddingTop: 18,
  },
  cardInner: {
    padding: 14,
  },
  attemptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 7,
  },
  attemptRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  attemptTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    width: 60,
  },
  attemptDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  attemptEvent: {
    fontFamily: fonts.mono,
    fontSize: 12,
    flex: 1,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
  },
  sourceIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: "rgba(232,90,90,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  sourcePulseDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
  },
  sourceInfo: {
    flex: 1,
  },
  sourceLocation: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  sourceIp: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },
  sourceTor: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.red,
    marginTop: 3,
  },
  affectedInner: {
    padding: 14,
  },
  affectedKey: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textPrimary,
  },
  affectedChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  chipMuted: {
    backgroundColor: colors.white04,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipMutedText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  chipGreen: {
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipGreenText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.green,
  },
  actionsContainer: {
    paddingHorizontal: 14,
    gap: 8,
    paddingTop: 4,
  },
  revokeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 13,
    backgroundColor: colors.red,
    borderRadius: 12,
  },
  revokeBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: "#fff",
  },
  rotateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  rotateBtnText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  safeBtn: {
    padding: 12,
    alignItems: "center",
  },
  safeBtnText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
});
