import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { getOAuthURL } from "@/api/auth";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const authUrl = await getOAuthURL();
      await WebBrowser.openBrowserAsync(authUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Top section */}
        <View style={styles.topSection}>
          <Text style={styles.terminalPrompt}>$ envpilot login</Text>

          <Text style={styles.heroText}>
            Secrets in{"\n"}your{" "}
            <Text style={styles.heroGreen}>pocket.</Text>
          </Text>

          <Text style={styles.description}>
            Sign in to manage environment variables, approve shares, and respond
            to anomalies.
          </Text>
        </View>

        {/* Bottom section */}
        <View style={styles.bottomSection}>
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title="Continue with Face ID"
            onPress={handleLogin}
            loading={loading}
            variant="primary"
            icon={<Icon name="face-id" size={20} color="#02110a" />}
          />

          <Button
            title="Continue with GitHub"
            onPress={handleLogin}
            loading={loading}
            variant="secondary"
            icon={<Icon name="github" size={20} color={colors.textPrimary} />}
          />

          <Button
            title="Sign in with email →"
            onPress={handleLogin}
            loading={loading}
            variant="ghost"
            icon={<Icon name="arrow-r" size={16} color={colors.muted} />}
            textStyle={styles.ghostButtonText}
          />

          <Text style={styles.ssoText}>
            # SSO via WorkOS · End-to-end encrypted
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  topSection: {
    gap: 16,
  },
  terminalPrompt: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.green,
    marginBottom: 8,
  },
  heroText: {
    fontFamily: fonts.sansBold,
    fontSize: 38,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 38 * -0.03,
    lineHeight: 38 * 1.05,
  },
  heroGreen: {
    color: colors.green,
  },
  description: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginTop: 14,
  },
  bottomSection: {
    gap: 10,
  },
  errorContainer: {
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.red,
  },
  ghostButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.muted,
  },
  ssoText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
    marginTop: 8,
    opacity: 0.6,
  },
});
