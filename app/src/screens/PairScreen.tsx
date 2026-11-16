import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "../session";
import { elevation, palette, radius, spacing, tones, typography } from "../theme";
import { Button } from "../components/ui";

function Field({
  label,
  icon,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }) {
  return (
    <View style={styles.field}>
      <Text style={typography.label}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name={icon} size={16} color={palette.muted} />
        <TextInput
          {...props}
          placeholderTextColor={palette.muted}
          style={styles.input}
          autoCapitalize={props.autoCapitalize ?? "none"}
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

export function PairScreen() {
  const { pair, base } = useSession();
  const insets = useSafeAreaInsets();
  const [server, setServer] = React.useState(base);
  const [password, setPassword] = React.useState("");
  const [deviceName, setDeviceName] = React.useState("Android");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => setServer(base), [base]);

  const connect = React.useCallback(async () => {
    if (!server.trim()) {
      setError("请填写 BFF 地址");
      return;
    }
    if (!password.trim()) {
      setError("请填写配对密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await pair(password, deviceName.trim() || "Android", server);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [deviceName, pair, password, server]);

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.glow, styles.glowA]} />
        <View style={[styles.glow, styles.glowB]} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logo}>
            <Ionicons name="shield-checkmark" size={36} color={palette.accent} />
          </View>
          <Text style={typography.display}>RyAgent</Text>
          <Text style={[typography.caption, styles.tagline]}>个人 Agent 控制台 · 任务 / 对话 / 安全情报</Text>

          <View style={styles.card}>
            <Field
              label="BFF 服务器"
              icon="server-outline"
              value={server}
              onChangeText={setServer}
              placeholder="http://127.0.0.1:8788"
              keyboardType="url"
            />
            <Field
              label="配对密码"
              icon="key-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="设备配对密码"
              secureTextEntry
              autoCapitalize="none"
            />
            <Field
              label="设备名称"
              icon="phone-portrait-outline"
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="例如 Xiaomi 15"
              autoCapitalize="sentences"
            />

            {error ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle-outline" size={16} color={palette.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Button
              title={busy ? "连接中…" : "连接并配对"}
              icon={busy ? undefined : "log-in-outline"}
              loading={busy}
              onPress={() => void connect()}
              style={styles.connect}
            />
            <Text style={styles.hint}>
              服务器地址、密码与 token 只保存在本机 SecureStore。建议通过 VPN 或 adb reverse 访问 BFF。
            </Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerDot} />
            <Text style={typography.caption}>单用户 · 端到端私有隧道</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg, overflow: "hidden" },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  glow: { position: "absolute", borderRadius: 999 },
  glowA: {
    width: 320,
    height: 320,
    backgroundColor: palette.accent,
    opacity: 0.11,
    top: -140,
    right: -120,
  },
  glowB: {
    width: 260,
    height: 260,
    backgroundColor: palette.cyan,
    opacity: 0.06,
    bottom: -80,
    left: -110,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: tones.accent.bg,
    borderWidth: 1,
    borderColor: tones.accent.border,
    marginBottom: spacing.lg,
    ...elevation.card,
  },
  tagline: { textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.floating,
  },
  field: { gap: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 48,
  },
  input: { flex: 1, color: palette.text, fontSize: 14, paddingVertical: 12 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: tones.red.bg,
    borderWidth: 1,
    borderColor: tones.red.border,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  errorText: { flex: 1, color: palette.red, fontSize: 12, lineHeight: 17 },
  connect: { marginTop: spacing.xs },
  hint: { ...typography.caption, textAlign: "center", lineHeight: 17 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.green,
  },
});
