import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Icon } from "@/components/ui/Icon";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

const RESTRICTIONS = [
  { icon: "clock", label: "Expires", value: "24 hours", color: colors.green },
  { icon: "eye", label: "Max views", value: "3 views", color: colors.blue },
  {
    icon: "lock",
    label: "OTP required",
    value: "Always",
    color: colors.amber,
  },
];

export default function ShareRecipientScreen() {
  const { varId } = useLocalSearchParams<{ varId: string }>();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const isValid = email.includes("@") && email.includes(".");

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Icon name="x" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerStep}>$ share — step 1/2</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Variable badge */}
        <View style={styles.titleBlock}>
          <View style={styles.varBadge}>
            <Text style={styles.varBadgeText}>VITE_STRIPE_PUBLIC_KEY</Text>
          </View>
          <Text style={styles.title}>Send via email + OTP</Text>
          <Text style={styles.subtitle}>
            The recipient gets an email with a one-time link. To open it, they
            enter the OTP we'll show you next.
          </Text>
        </View>

        <View style={styles.formContainer}>
          {/* Email input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>RECIPIENT EMAIL</Text>
            <View
              style={[
                styles.emailInputWrap,
                isValid && styles.emailInputWrapValid,
              ]}
            >
              <Icon
                name="send"
                size={14}
                color={isValid ? colors.green : colors.muted}
              />
              <TextInput
                style={styles.emailInput}
                value={email}
                onChangeText={setEmail}
                placeholder="recipient@email.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isValid && <Icon name="check" size={14} color={colors.green} />}
            </View>
            {email.length > 0 && (
              <Text style={styles.emailHint}>
                # {email.split("@")[0] || "recipient"} is not a workspace member
                · external
              </Text>
            )}
          </View>

          {/* Restrictions */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>RESTRICTIONS</Text>
            <View style={styles.restrictionsList}>
              {RESTRICTIONS.map((r, idx) => (
                <View
                  key={r.label}
                  style={[
                    styles.restrictionRow,
                    idx < RESTRICTIONS.length - 1 &&
                      styles.restrictionRowBorder,
                  ]}
                >
                  <Icon name={r.icon} size={15} color={r.color} />
                  <View style={styles.restrictionTextWrap}>
                    <Text style={styles.restrictionLabel}>{r.label}</Text>
                  </View>
                  <Text style={styles.restrictionValue}>{r.value}</Text>
                  <Icon name="chev-r" size={13} color={colors.muted} />
                </View>
              ))}
            </View>
          </View>

          {/* Note */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>NOTE (optional)</Text>
            <View style={styles.noteInputWrap}>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="// shared so you can wire up checkout"
                placeholderTextColor={colors.muted}
                multiline
              />
            </View>
          </View>

          {/* Send button */}
          <Pressable
            style={[styles.sendBtn, !isValid && styles.sendBtnDisabled]}
            disabled={!isValid}
          >
            <Icon name="send" size={16} color="#02110a" />
            <Text style={styles.sendBtnText}>
              Send to {email || "recipient"}
            </Text>
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
  closeBtn: {
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
  titleBlock: {
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  varBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  varBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.green,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginTop: 14,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  formContainer: {
    paddingHorizontal: 14,
    paddingTop: 18,
    gap: 14,
  },
  fieldGroup: {},
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    marginBottom: 6,
    paddingLeft: 2,
  },
  emailInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emailInputWrapValid: {
    borderColor: colors.green,
  },
  emailInput: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  emailHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 6,
    paddingLeft: 2,
  },
  restrictionsList: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  restrictionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  restrictionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  restrictionTextWrap: {
    flex: 1,
  },
  restrictionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  restrictionValue: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  noteInputWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
  },
  noteInput: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.muted,
    padding: 0,
  },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    backgroundColor: colors.green,
    borderRadius: 12,
    marginTop: 4,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: "#02110a",
  },
});
