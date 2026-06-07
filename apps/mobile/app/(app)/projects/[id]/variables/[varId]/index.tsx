import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { MonoCard } from "@/components/ui/MonoCard";
import { Icon } from "@/components/ui/Icon";
import { decryptValue } from "@/api/vault";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import type { Id } from "convex/_generated/dataModel";
import * as Clipboard from "expo-clipboard"; // run: bunx expo install expo-clipboard

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const ACTION_COLORS: Record<string, string> = {
  create: colors.green,
  update: colors.blue,
  delete: colors.red,
  reveal: colors.amber,
  access: colors.purple,
  rotate: colors.amber,
};

function getActionColor(action: string): string {
  for (const key of Object.keys(ACTION_COLORS)) {
    if (action.toLowerCase().includes(key)) return ACTION_COLORS[key];
  }
  return colors.muted;
}

// ---------------------------------------------------------------------------
// MetadataRow component
// ---------------------------------------------------------------------------

function MetadataRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View
      style={[
        styles.metaRow,
        !isLast && styles.metaRowBorder,
      ]}
    >
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function VariableDetailScreen() {
  const { id, varId } = useLocalSearchParams<{
    id: string;
    varId: string;
  }>();
  const variableId = varId as Id<"environmentVariables">;

  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoHideSeconds, setAutoHideSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const variable = useQuery(api.variables.getById, { variableId });
  const project = useQuery(
    api.projects.getById,
    variable ? { projectId: variable.projectId } : "skip"
  );
  const auditLogs = useQuery(api.auditLogs.listByVariable, {
    variableId,
    limit: 4,
  });

  // Auto-hide timer
  useEffect(() => {
    if (revealedValue && autoHideSeconds !== null) {
      if (autoHideSeconds <= 0) {
        setRevealedValue(null);
        setAutoHideSeconds(null);
        return;
      }
      timerRef.current = setInterval(() => {
        setAutoHideSeconds((prev) => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setRevealedValue(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [revealedValue !== null]);

  const handleReveal = useCallback(async () => {
    if (revealedValue) {
      if (timerRef.current) clearInterval(timerRef.current);
      setRevealedValue(null);
      setAutoHideSeconds(null);
      return;
    }
    if (!variable) return;
    setRevealing(true);
    const value = await decryptValue(variable.vaultRef);
    setRevealedValue(value);
    setAutoHideSeconds(28);
    setRevealing(false);
  }, [revealedValue, variable]);

  const handleCopy = useCallback(async () => {
    if (revealedValue) {
      await Clipboard.setStringAsync(revealedValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [revealedValue]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow-l" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.breadcrumb} numberOfLines={1}>
          {project?.slug ?? "..."} /
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {variable ? (
          <>
            {/* ---- Variable key ---- */}
            <Text style={styles.varKey}>{variable.key}</Text>

            {/* ---- Chips row ---- */}
            <View style={styles.chipsRow}>
              {variable.environments.map((env) => (
                <View key={env} style={styles.envChip}>
                  <Text style={styles.envChipText}>{env}</Text>
                </View>
              ))}
              <View style={styles.versionChip}>
                <Text style={styles.versionChipText}>v{variable.version}</Text>
              </View>
              {variable.isSensitive && (
                <View style={styles.sensitiveChip}>
                  <Text style={styles.sensitiveChipText}>
                    {"●"} sensitive
                  </Text>
                </View>
              )}
            </View>

            {/* ---- Value Card ---- */}
            <MonoCard
              title={
                revealedValue
                  ? `value — auto-hides in ${autoHideSeconds ?? 0}s`
                  : "value"
              }
              accent={
                revealing ? (
                  <ActivityIndicator size="small" color={colors.green} />
                ) : (
                  <Pressable onPress={handleReveal} hitSlop={8}>
                    <Icon
                      name={revealedValue ? "eye" : "eye-off"}
                      size={14}
                      color={revealedValue ? colors.green : colors.muted}
                    />
                  </Pressable>
                )
              }
            >
              <View style={styles.valueSection}>
                <View style={styles.valueBox}>
                  <Text style={styles.valueText} selectable>
                    {revealedValue ?? "••••••••••••••••"}
                  </Text>
                </View>
                <View style={styles.valueActions}>
                  <Pressable
                    onPress={handleCopy}
                    style={[
                      styles.valueActionBtn,
                      !revealedValue && styles.valueActionBtnDisabled,
                    ]}
                    disabled={!revealedValue}
                  >
                    <Icon
                      name={copied ? "check" : "copy"}
                      size={13}
                      color={revealedValue ? colors.textPrimary : colors.muted}
                    />
                    <Text
                      style={[
                        styles.valueActionText,
                        !revealedValue && styles.valueActionTextDisabled,
                      ]}
                    >
                      {copied ? "copied" : "copy"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.valueActionBtn,
                      !revealedValue && styles.valueActionBtnDisabled,
                    ]}
                    disabled={!revealedValue}
                  >
                    <Icon
                      name="share"
                      size={13}
                      color={revealedValue ? colors.textPrimary : colors.muted}
                    />
                    <Text
                      style={[
                        styles.valueActionText,
                        !revealedValue && styles.valueActionTextDisabled,
                      ]}
                    >
                      share
                    </Text>
                  </Pressable>
                  <Pressable style={styles.valueActionBtn}>
                    <Icon name="clock" size={13} color={colors.textPrimary} />
                    <Text style={styles.valueActionText}>history</Text>
                  </Pressable>
                  <Pressable style={styles.valueActionBtnDanger}>
                    <Icon name="x" size={13} color={colors.red} />
                    <Text style={styles.valueActionTextDanger}>revoke</Text>
                  </Pressable>
                </View>
              </View>
            </MonoCard>

            {/* ---- Metadata Card ---- */}
            <MonoCard title="metadata">
              <View style={styles.metaSection}>
                <MetadataRow
                  label="created"
                  value={formatTimestamp(variable.createdAt)}
                />
                <MetadataRow
                  label="last rotated"
                  value={
                    variable.updatedAt !== variable.createdAt
                      ? formatRelativeTime(variable.updatedAt)
                      : "never"
                  }
                />
                <MetadataRow
                  label="last access"
                  value={formatRelativeTime(variable.updatedAt)}
                />
                <MetadataRow
                  label="encryption"
                  value="AES-256 (WorkOS Vault)"
                  isLast
                />
              </View>
            </MonoCard>

            {/* ---- Recent Access Card ---- */}
            <MonoCard
              title={`recent access — ${auditLogs?.length ?? 0} events`}
            >
              <View style={styles.accessSection}>
                {auditLogs && auditLogs.length > 0 ? (
                  auditLogs.map((log, index) => {
                    const actionColor = getActionColor(log.action);
                    const isLast = index === auditLogs.length - 1;
                    return (
                      <View
                        key={log._id}
                        style={[
                          styles.accessRow,
                          !isLast && styles.accessRowBorder,
                        ]}
                      >
                        {/* Timeline dot + line */}
                        <View style={styles.timelineDot}>
                          <View
                            style={[
                              styles.dot,
                              { backgroundColor: actionColor },
                            ]}
                          />
                          {!isLast && (
                            <View style={styles.timelineLine} />
                          )}
                        </View>
                        <View style={styles.accessContent}>
                          <View style={styles.accessTopRow}>
                            <Text
                              style={[
                                styles.accessAction,
                                { color: actionColor },
                              ]}
                            >
                              {log.action}
                            </Text>
                            <Text style={styles.accessTime}>
                              {formatRelativeTime(log.createdAt)}
                            </Text>
                          </View>
                          <Text style={styles.accessActor} numberOfLines={1}>
                            {"userName" in log
                              ? (log as { userName?: string }).userName ?? "system"
                              : "system"}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyAccess}>
                    <Text style={styles.emptyAccessText}>
                      No recent access events
                    </Text>
                  </View>
                )}
              </View>
            </MonoCard>
          </>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={colors.green} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}
      </ScrollView>
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
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  breadcrumb: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.muted,
    flex: 1,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 18,
    paddingBottom: 40,
  },

  // Variable key
  varKey: {
    fontFamily: fonts.monoSemibold,
    fontSize: 18,
    color: colors.textPrimary,
    paddingHorizontal: 22,
    marginBottom: 16,
  },

  // Chips
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 22,
    marginBottom: 18,
  },
  envChip: {
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  envChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.green,
  },
  versionChip: {
    backgroundColor: colors.white04,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  versionChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  sensitiveChip: {
    backgroundColor: colors.amberSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sensitiveChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.amber,
  },

  // Value section
  valueSection: {
    padding: 14,
  },
  valueBox: {
    backgroundColor: colors.black30,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  valueText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.green,
    lineHeight: 20,
  },
  valueActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  valueActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.white04,
  },
  valueActionBtnDisabled: {
    opacity: 0.5,
  },
  valueActionText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textPrimary,
  },
  valueActionTextDisabled: {
    color: colors.muted,
  },
  valueActionBtnDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.white04,
  },
  valueActionTextDanger: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.red,
  },

  // Metadata
  metaSection: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  metaRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  metaLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  metaValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.textPrimary,
  },

  // Access section
  accessSection: {
    padding: 12,
  },
  accessRow: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 10,
  },
  accessRowBorder: {
    marginBottom: 8,
  },
  timelineDot: {
    alignItems: "center",
    width: 14,
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  accessContent: {
    flex: 1,
  },
  accessTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  accessAction: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    textTransform: "lowercase",
  },
  accessTime: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  accessActor: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },

  // Empty & loading
  emptyAccess: {
    paddingVertical: 16,
    alignItems: "center",
  },
  emptyAccessText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 40,
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.muted,
  },
});
