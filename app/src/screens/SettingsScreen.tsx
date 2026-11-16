import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import React from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  Avatar,
  Button,
  Card,
  Divider,
  Header,
  Pill,
  Screen,
  SectionTitle,
} from "../components/ui";
import { useSession } from "../session";
import { palette, radius, spacing, tones, typography } from "../theme";

function Row({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={16} color={palette.textSecondary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={typography.caption}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SettingsScreen() {
  const { base, deviceName, token, disconnect, changeServer } = useSession();
  const [editing, setEditing] = React.useState(false);
  const [server, setServer] = React.useState(base);

  React.useEffect(() => setServer(base), [base]);

  const saveServer = React.useCallback(() => {
    if (!server.trim()) {
      Alert.alert("地址不能为空", "请填写 BFF 服务器地址。");
      return;
    }
    Alert.alert("更换服务器？", "当前配对 token 会被清除，需要重新输入配对密码。", [
      { text: "取消", style: "cancel" },
      {
        text: "更换",
        style: "destructive",
        onPress: () => {
          changeServer(server)
            .then(() => setEditing(false))
            .catch((error: unknown) =>
              Alert.alert("保存失败", error instanceof Error ? error.message : String(error)),
            );
        },
      },
    ]);
  }, [changeServer, server]);

  const askDisconnect = React.useCallback(() => {
    Alert.alert("断开并清除 token？", "设备需要重新配对才能继续访问。", [
      { text: "取消", style: "cancel" },
      { text: "断开", style: "destructive", onPress: () => void disconnect() },
    ]);
  }, [disconnect]);

  const version = Constants.expoConfig?.version ?? "0.1.0";

  return (
    <Screen>
      <Header title="设置" subtitle="连接、安全与关于" large />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.profile}>
          <View style={styles.profileHead}>
            <Avatar seed={deviceName ?? "device"} label={deviceName ?? "设备"} size={52} icon="shield-checkmark-outline" />
            <View style={styles.profileText}>
              <Text style={styles.profileName}>{deviceName || "Android 设备"}</Text>
              <Text style={typography.caption}>RyAgent 单用户控制台</Text>
            </View>
            <Pill label={token ? "已配对" : "未配对"} tone={token ? "green" : "muted"} dot />
          </View>
        </Card>

        <SectionTitle title="连接" />
        <Card style={styles.group}>
          {editing ? (
            <View style={styles.editBlock}>
              <Text style={typography.label}>BFF 服务器</Text>
              <TextInput
                value={server}
                onChangeText={setServer}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://127.0.0.1:8788"
                placeholderTextColor={palette.muted}
                style={styles.input}
              />
              <View style={styles.editActions}>
                <Button
                  title="保存"
                  icon="checkmark"
                  size="sm"
                  onPress={saveServer}
                  style={styles.flex}
                />
                <Button
                  title="取消"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    setServer(base);
                    setEditing(false);
                  }}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : (
            <>
              <Row
                icon="server-outline"
                title="BFF 地址"
                subtitle={base}
                right={
                  <Button
                    title="更换"
                    variant="ghost"
                    size="sm"
                    onPress={() => setEditing(true)}
                  />
                }
              />
              <Divider />
              <Row
                icon="wifi-outline"
                title="传输通道"
                subtitle="通过 VPN / adb reverse 访问，不走公网中间服务"
                right={<Pill label="私有" tone="cyan" />}
              />
            </>
          )}
        </Card>

        <SectionTitle title="安全" />
        <Card style={styles.group}>
          <Row
            icon="key-outline"
            title="设备 Token"
            subtitle={token ? "保存在本机 SecureStore，仅随请求头发送" : "当前没有 token"}
            right={<Ionicons name="lock-closed-outline" size={15} color={palette.green} />}
          />
          <Divider />
          <Row
            icon="finger-print-outline"
            title="单用户模式"
            subtitle="BFF 使用 owner password 配对设备；不开放注册"
            right={<Pill label="ON" tone="green" />}
          />
        </Card>

        <SectionTitle title="能力" />
        <Card style={styles.group}>
          <Row
            icon="layers-outline"
            title="ARTEX Connector"
            subtitle="任务进度、主 Agent 对话、审批与指令"
            right={<Pill label="P0" tone="violet" />}
          />
          <Divider />
          <Row
            icon="radio-outline"
            title="GitHub Following"
            subtitle="监控关注者的 Star 与公开动态，按仓库/事件永久去重"
            right={<Pill label="LIVE" tone="cyan" dot />}
          />
          <Divider />
          <Row
            icon="newspaper-outline"
            title="Intel Hub"
            subtitle="先知 / 安全客 / Seebug Paper / 嘶吼 / CN-SEC / 腾讯玄武 / FreeBuf · 全量拉取"
            right={<Pill label="LIVE" tone="violet" dot />}
          />
          <Divider />
          <Row
            icon="briefcase-outline"
            title="Job Radar"
            subtitle="国聘 / 猎聘 / 职友集 / 国家就业平台 / 看雪 / RemoteOK · 成都安全岗位匹配"
            right={<Pill label="LIVE" tone="green" dot />}
          />
          <Divider />
          <Row
            icon="sparkles-outline"
            title="Conductor AI"
            subtitle="DeepSeek 主控助手，写操作需要二次确认"
            right={<Pill label="BETA" tone="amber" />}
          />
        </Card>

        <SectionTitle title="关于" />
        <Card style={styles.about}>
          <Text style={styles.aboutTitle}>RyAgent</Text>
          <Text style={typography.caption}>版本 {version} · 个人单用户 Agent 控制台</Text>
          <Text style={styles.aboutText}>
            平台只做聚合与控制：ARTEX 是第一个 Connector，后续能力以独立页面加入底部导航。所有敏感配置只存在于服务端
            env 与本机 SecureStore。
          </Text>
        </Card>

        <Button
          title="断开并清除 token"
          icon="log-out-outline"
          variant="danger"
          onPress={askDisconnect}
          style={styles.disconnect}
        />
        <Text style={[typography.caption, styles.footer]}>RyAgent Platform · 本地优先</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.md, paddingBottom: 150, gap: spacing.xs },
  profile: { marginTop: spacing.xs },
  profileHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  profileText: { flex: 1, gap: 2 },
  profileName: { color: palette.text, fontSize: 17, fontWeight: "800" },
  group: { paddingVertical: spacing.xxs, paddingHorizontal: spacing.md, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: palette.text, fontSize: 14, fontWeight: "700" },
  flex: { flex: 1 },
  editBlock: { paddingVertical: spacing.sm, gap: spacing.xs },
  input: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    color: palette.text,
    fontSize: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 11,
  },
  editActions: { flexDirection: "row", gap: spacing.xs },
  about: { gap: spacing.xs },
  aboutTitle: { color: palette.text, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  aboutText: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 19, marginTop: 2 },
  disconnect: { marginTop: spacing.sm },
  footer: { textAlign: "center", marginTop: spacing.sm, color: tones.muted.fg },
});
