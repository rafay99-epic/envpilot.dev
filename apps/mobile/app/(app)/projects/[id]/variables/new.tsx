import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { Icon } from "@/components/ui/Icon";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import { useAuthStore } from "@/stores/auth.store";
import type { Id } from "convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENVIRONMENTS = ["development", "staging", "production"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeEntropy(value: string): {
  label: string;
  color: string;
  level: "weak" | "moderate" | "strong";
} {
  if (!value || value.length < 4)
    return { label: "too short", color: colors.red, level: "weak" };

  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const hasSpecial = /[^a-zA-Z0-9]/.test(value);
  const charsetSize =
    (hasUpper ? 26 : 0) +
    (hasLower ? 26 : 0) +
    (hasDigit ? 10 : 0) +
    (hasSpecial ? 30 : 0);
  const entropy = value.length * Math.log2(charsetSize || 1);

  if (entropy >= 60) return { label: "strong entropy", color: colors.green, level: "strong" };
  if (entropy >= 36) return { label: "moderate entropy", color: colors.amber, level: "moderate" };
  return { label: "weak entropy", color: colors.red, level: "weak" };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AddVariableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = id as Id<"projects">;
  const userId = useAuthStore((s) => s.userId);

  const project = useQuery(api.projects.getById, { projectId });
  const createVariable = useMutation(api.variables.create);

  // Form state
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [selectedEnvs, setSelectedEnvs] = useState<Set<string>>(
    new Set(["development"])
  );
  const [isSensitive, setIsSensitive] = useState(false);
  const [saving, setSaving] = useState(false);

  const entropy = computeEntropy(value);

  const toggleEnv = useCallback((env: string) => {
    setSelectedEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(env)) {
        if (next.size > 1) next.delete(env);
      } else {
        next.add(env);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!key.trim()) {
      Alert.alert("Missing key", "Please enter a variable key.");
      return;
    }
    if (!value.trim()) {
      Alert.alert("Missing value", "Please enter a variable value.");
      return;
    }
    if (!userId) {
      Alert.alert("Auth error", "You must be logged in to add variables.");
      return;
    }

    setSaving(true);
    try {
      await createVariable({
        key: key.trim().toUpperCase(),
        vaultRef: value, // In a real flow this would be encrypted via vault first
        environments: Array.from(selectedEnvs),
        projectId,
        isSensitive,
        createdBy: userId,
      });
      router.back();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create variable.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  }, [key, value, selectedEnvs, projectId, isSensitive, userId, createVariable]);

  const canSave = key.trim().length > 0 && value.trim().length > 0 && !saving;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerCmd}>$ vars add</Text>
        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          hitSlop={12}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.green} />
          ) : (
            <Text
              style={[
                styles.saveText,
                !canSave && styles.saveTextDisabled,
              ]}
            >
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---- Title ---- */}
          <Text style={styles.title}>New variable</Text>
          <Text style={styles.subtitle}>
            Add a new environment variable to{" "}
            {project?.name ?? "this project"}.
          </Text>

          {/* ---- KEY input ---- */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>KEY</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.monoInput}
                value={key}
                onChangeText={(t) => setKey(t.toUpperCase())}
                placeholder="DATABASE_URL"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
              />
            </View>
          </View>

          {/* ---- VALUE input ---- */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>VALUE</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.monoInput, styles.valueInput]}
                value={value}
                onChangeText={setValue}
                placeholder="paste or type value..."
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                multiline
                textAlignVertical="top"
              />
            </View>
            <View style={styles.valueHints}>
              <View style={styles.hintLeft}>
                <Icon name="lock" size={11} color={colors.muted} />
                <Text style={styles.hintText}>encrypted at rest</Text>
              </View>
              {value.length > 0 && (
                <View style={styles.hintRight}>
                  <Text style={[styles.entropyDot, { color: entropy.color }]}>
                    {"●"}
                  </Text>
                  <Text style={[styles.hintTextRight, { color: entropy.color }]}>
                    {entropy.label}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ---- ENVIRONMENT toggles ---- */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ENVIRONMENT</Text>
            <View style={styles.envRow}>
              {ENVIRONMENTS.map((env) => {
                const isActive = selectedEnvs.has(env);
                return (
                  <Pressable
                    key={env}
                    onPress={() => toggleEnv(env)}
                    style={[
                      styles.envToggle,
                      isActive && styles.envToggleActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.envToggleText,
                        isActive && styles.envToggleTextActive,
                      ]}
                    >
                      {env}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ---- Sensitive toggle ---- */}
          <View style={styles.sensitiveCard}>
            <View style={styles.sensitiveContent}>
              <Text style={styles.sensitiveTitle}>Mark as sensitive</Text>
              <Text style={styles.sensitiveDesc}>
                # requires vault unlock to reveal
              </Text>
            </View>
            <Switch
              value={isSensitive}
              onValueChange={setIsSensitive}
              trackColor={{
                false: colors.border2,
                true: colors.green,
              }}
              thumbColor={isSensitive ? colors.bg : colors.muted}
              ios_backgroundColor={colors.border2}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cancelText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.muted,
  },
  headerCmd: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  saveText: {
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    color: colors.green,
  },
  saveTextDisabled: {
    opacity: 0.4,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // Title
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 28,
    lineHeight: 18,
  },

  // Field group
  fieldGroup: {
    marginBottom: 22,
  },
  fieldLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  inputContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  valueInput: {
    minHeight: 84,
    color: colors.green,
  },

  // Value hints
  valueHints: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  hintLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  hintText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.muted,
  },
  hintRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  entropyDot: {
    fontSize: 8,
  },
  hintTextRight: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
  },

  // Environment toggles
  envRow: {
    flexDirection: "row",
    gap: 8,
  },
  envToggle: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  envToggleActive: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenBorder,
  },
  envToggleText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  envToggleTextActive: {
    color: colors.green,
  },

  // Sensitive toggle
  sensitiveCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  sensitiveContent: {
    flex: 1,
    marginRight: 14,
  },
  sensitiveTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  sensitiveDesc: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    lineHeight: 16,
  },
});
