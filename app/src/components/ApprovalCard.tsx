import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { relativeTime } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Approval } from "../types";
import { Button, Pill } from "./ui";

export function ApprovalCard({
  approval,
  onDecide,
  showTask = false,
  busy = false,
}: {
  approval: Approval;
  onDecide: (allow: boolean) => void;
  showTask?: boolean;
  busy?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="shield-half-outline" size={15} color={palette.amber} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.tool} numberOfLines={1}>
            {approval.tool_name || "工具调用"}
          </Text>
          <Text style={typography.caption}>
            {showTask ? `task #${approval.task_id ?? "?"} · ` : ""}
            #{approval.id}
            {approval.created_at ? ` · ${relativeTime(approval.created_at)}` : ""}
          </Text>
        </View>
        <Pill label="待审批" tone="amber" dot />
      </View>

      {approval.reason ? (
        <Text style={styles.reason} numberOfLines={4}>
          {approval.reason}
        </Text>
      ) : (
        <Text style={[styles.reason, { color: palette.muted }]}>未提供原因</Text>
      )}

      <View style={styles.actions}>
        <Button
          title="允许"
          icon="checkmark"
          size="sm"
          onPress={() => onDecide(true)}
          disabled={busy}
          style={styles.action}
        />
        <Button
          title="拒绝"
          icon="close"
          size="sm"
          variant="danger"
          onPress={() => onDecide(false)}
          disabled={busy}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tones.amber.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tones.amber.bg,
    borderWidth: 1,
    borderColor: tones.amber.border,
  },
  titleWrap: { flex: 1 },
  tool: { color: palette.text, fontSize: 14, fontWeight: "700" },
  reason: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  action: { flex: 1 },
});
