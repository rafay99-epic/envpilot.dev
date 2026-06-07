import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Icon } from "@/components/ui/Icon";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

const OTP_DIGITS = ["8", "3", "K", "9", "M", "2"];

const NEXT_STEPS = [
  {
    num: "1",
    text: "Recipient receives an email with the link",
    icon: "send",
  },
  {
    num: "2",
    text: "They open it and enter this OTP to authenticate",
    icon: "lock",
  },
  {
    num: "3",
    text: "You get notified each time the link is viewed",
    icon: "bell",
  },
];

export default function ShareOTPScreen() {
  const otpCode = OTP_DIGITS.join("");

  const handleCopy = async () => {
    await Clipboard.setStringAsync(otpCode);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-l" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerStep}>$ share — step 2/2</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Success icon */}
        <View style={styles.successBlock}>
          <View style={styles.successIconWrap}>
            <Icon name="check" size={32} color={colors.green} />
          </View>
          <Text style={styles.successTitle}>Email sent</Text>
          <Text style={styles.successDesc}>
            Share this OTP with{" "}
            <Text style={styles.successEmail}>umaidnaeem@gmail.com</Text>{" "}
            through any other channel — they'll need it to open the email link.
          </Text>
        </View>

        {/* OTP code card */}
        <View style={styles.otpCard}>
          <View style={styles.otpGlow} />
          <Text style={styles.otpLabel}>One-time code</Text>
          <View style={styles.otpRow}>
            {OTP_DIGITS.map((digit, i) => (
              <View key={i} style={styles.otpDigitBox}>
                <Text style={styles.otpDigit}>{digit}</Text>
              </View>
            ))}
          </View>
          <View style={styles.otpActions}>
            <Pressable style={styles.otpActionBtn} onPress={handleCopy}>
              <Icon name="copy" size={12} color={colors.textPrimary} />
              <Text style={styles.otpActionText}>copy code</Text>
            </Pressable>
            <Pressable style={styles.otpActionBtn}>
              <Icon name="share" size={12} color={colors.textPrimary} />
              <Text style={styles.otpActionText}>share</Text>
            </Pressable>
          </View>
          <Text style={styles.otpExpiry}>expires with link in 23h 58m</Text>
        </View>

        {/* What happens next */}
        <View style={styles.nextSection}>
          <Text style={styles.nextLabel}>What happens next</Text>
          <View style={styles.nextSteps}>
            {NEXT_STEPS.map((step) => (
              <View key={step.num} style={styles.nextStepRow}>
                <View style={styles.nextStepNum}>
                  <Text style={styles.nextStepNumText}>{step.num}</Text>
                </View>
                <Text style={styles.nextStepText}>{step.text}</Text>
                <Icon name={step.icon} size={14} color={colors.muted} />
              </View>
            ))}
          </View>
        </View>

        {/* Done button */}
        <View style={styles.doneContainer}>
          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
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
    paddingVertical: 8,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerStep: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  successBlock: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 4,
    alignItems: "center",
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 14,
  },
  successDesc: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
    textAlign: "center",
  },
  successEmail: {
    color: colors.textPrimary,
    fontFamily: fonts.sansSemibold,
  },
  otpCard: {
    marginHorizontal: 14,
    marginTop: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    overflow: "hidden",
  },
  otpGlow: {
    position: "absolute",
    top: -30,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(30,224,122,0.15)",
  },
  otpLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  otpRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  otpDigitBox: {
    width: 42,
    height: 54,
    backgroundColor: colors.black40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  otpDigit: {
    fontFamily: fonts.monoSemibold,
    fontSize: 24,
    color: colors.green,
  },
  otpActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 18,
  },
  otpActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.white04,
    borderRadius: 8,
  },
  otpActionText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textPrimary,
  },
  otpExpiry: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 14,
  },
  nextSection: {
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  nextLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  nextSteps: {
    gap: 10,
  },
  nextStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  nextStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.greenSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  nextStepNumText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    color: colors.green,
  },
  nextStepText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
  },
  doneContainer: {
    paddingHorizontal: 14,
    paddingTop: 22,
  },
  doneBtn: {
    width: "100%",
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
  },
  doneBtnText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
