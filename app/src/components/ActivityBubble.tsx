import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useActivityDetail } from "../hooks/queries";
import { clockTime } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Activity } from "../types";
import { Avatar } from "./ui";

export type ActivitySource =
  | { type: "conversation"; id: number }
  | { type: "task"; id: string };

const LONG_TEXT = 1100;
const TOOL_DETAIL_CAP = 6000;

function workerLabel(worker?: string): string {
  switch (worker) {
    case "mainagent":
      return "主 Agent";
    case "planner":
      return "规划器";
    case "system":
      return "系统";
    case "user":
      return "我";
    case undefined:
    case "":
      return "Agent";
    default:
      return worker;
  }
}

function clamp(value: string, max: number): { text: string; truncated: boolean } {
  if (value.length <= max) return { text: value, truncated: false };
  return { text: `${value.slice(0, max)}\n\n…（已截断）`, truncated: true };
}

/**
 * One ARTEX activity step. The same component renders both a standalone chat
 * thread (`source.type === "conversation"`) and a task's main-agent timeline
 * (`source.type === "task"`); only the detail URL differs.
 */
export function ActivityBubble({
  item,
  source,
}: {
  item: Activity;
  source: ActivitySource;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const kind = item.kind ?? "text";
  // Full text is worth fetching up front only for human/assistant prose. Tool
  // payloads and results stay summary-only until the operator taps to expand.
  const wantsDetail = kind === "user" || kind === "text" || kind === "thinking";
  const detail = useActivityDetail(source, item.seq, wantsDetail || expanded);
  const fullText = (detail.data?.detail || item.detail || item.summary || "").trim();
  const summary = (item.summary || "").trim();

  if (kind === "usage") return null;

  if (kind === "user") {
    const long = fullText.length > LONG_TEXT;
    const text = long && !expanded ? `${fullText.slice(0, LONG_TEXT)}…` : fullText;
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText} selectable>
            {text || summary}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>我</Text>
            <Text style={styles.meta}>{clockTime(item.ts)}</Text>
          </View>
          {long && !expanded ? (
            <Pressable onPress={() => setExpanded(true)} hitSlop={8}>
              <Text style={styles.more}>展开全文</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (kind === "text" || kind === "thinking") {
    const thinking = kind === "thinking";
    const long = fullText.length > LONG_TEXT;
    const visible = long && !expanded ? `${fullText.slice(0, LONG_TEXT)}…` : fullText;
    return (
      <View style={styles.assistantRow}>
        <Avatar
          seed={item.worker || "agent"}
          label={workerLabel(item.worker)}
          size={34}
          icon={thinking ? "bulb-outline" : "sparkles"}
        />
        <View style={styles.assistantBody}>
          <View style={styles.assistantHead}>
            <Text style={styles.worker}>{workerLabel(item.worker)}</Text>
            <Text style={styles.meta}>{clockTime(item.ts)}</Text>
          </View>
          <View
            style={[
              styles.assistantBubble,
              thinking && styles.thinkingBubble,
              item.is_error && styles.errorBubble,
            ]}
          >
            <Text
              style={[
                thinking ? styles.thinkingText : styles.assistantText,
                item.is_error && { color: palette.red },
              ]}
              selectable
            >
              {visible || summary || "（空消息）"}
            </Text>
            {long && !expanded ? (
              <Pressable onPress={() => setExpanded(true)} hitSlop={8}>
                <Text style={styles.more}>展开全文</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  if (kind === "tool_use" || kind === "tool_result") {
    const isResult = kind === "tool_result";
    const toolTone = item.is_error ? tones.red : isResult ? tones.cyan : tones.violet;
    const detailText = expanded ? clamp(fullText || summary, TOOL_DETAIL_CAP) : null;
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.toolRow, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.toolIcon, { backgroundColor: toolTone.bg, borderColor: toolTone.border }]}>
          <Ionicons
            name={isResult ? "terminal-outline" : "construct-outline"}
            size={14}
            color={toolTone.fg}
          />
        </View>
        <View style={styles.toolBody}>
          <View style={styles.assistantHead}>
            <Text style={styles.toolTitle} numberOfLines={1}>
              {workerLabel(item.worker)} · {item.tool || (isResult ? "工具结果" : "工具调用")}
            </Text>
            <View style={styles.toolMetaRight}>
              {item.is_error ? (
                <Text style={[styles.meta, { color: palette.red }]}>失败</Text>
              ) : null}
              <Text style={styles.meta}>{clockTime(item.ts)}</Text>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={13}
                color={palette.muted}
              />
            </View>
          </View>
          {expanded ? (
            detail.isLoading && !fullText ? (
              <Text style={styles.meta}>加载详情…</Text>
            ) : (
              <Text style={styles.toolDetail} selectable>
                {detailText?.text || "（无详情）"}
              </Text>
            )
          ) : (
            <Text style={styles.toolSummary} numberOfLines={2}>
              {summary || "（无摘要，点击查看）"}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  if (kind === "result") {
    const long = fullText.length > LONG_TEXT;
    const visible = long && !expanded ? `${fullText.slice(0, LONG_TEXT)}…` : fullText;
    const tokens =
      (item.input_tokens ?? 0) + (item.output_tokens ?? 0) > 0
        ? `输入 ${item.input_tokens ?? 0} · 输出 ${item.output_tokens ?? 0} tokens`
        : "";
    return (
      <View style={[styles.resultCard, item.is_error && styles.errorBubble]}>
        <View style={styles.assistantHead}>
          <View style={styles.resultTitleRow}>
            <Ionicons
              name={item.is_error ? "alert-circle-outline" : "flag-outline"}
              size={14}
              color={item.is_error ? palette.red : palette.green}
            />
            <Text style={[styles.worker, item.is_error && { color: palette.red }]}>
              {item.is_error ? "执行出错" : "执行结果"}
            </Text>
          </View>
          <Text style={styles.meta}>
            {workerLabel(item.worker)} · {clockTime(item.ts)}
          </Text>
        </View>
        <Text style={styles.assistantText} selectable>
          {visible || summary || "（无结果）"}
        </Text>
        {!expanded ? (
          <Pressable onPress={() => setExpanded(true)} hitSlop={8}>
            <Text style={styles.more}>查看详情</Text>
          </Pressable>
        ) : null}
        {tokens ? <Text style={styles.meta}>{tokens}</Text> : null}
      </View>
    );
  }

  const detailText = clamp(expanded ? fullText || summary : summary, TOOL_DETAIL_CAP);
  return (
    <Pressable onPress={() => setExpanded((value) => !value)} style={styles.plainRow}>
      <Text style={styles.meta}>{kind}</Text>
      <Text style={styles.plainText} numberOfLines={expanded ? undefined : 2} selectable>
        {expanded ? detailText.text : summary || "（无内容）"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: "flex-end", marginVertical: spacing.xs },
  userBubble: {
    maxWidth: "86%",
    backgroundColor: tones.accent.bg,
    borderWidth: 1,
    borderColor: tones.accent.border,
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    gap: 5,
  },
  userText: { color: palette.text, fontSize: 14, lineHeight: 21 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs },
  meta: { color: palette.muted, fontSize: 10, lineHeight: 14 },
  more: { color: palette.accent, fontSize: 12, fontWeight: "700", marginTop: 4 },
  assistantRow: { flexDirection: "row", gap: spacing.xs, marginVertical: spacing.xs },
  assistantBody: { flex: 1, gap: 4 },
  assistantHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  worker: { color: palette.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  assistantBubble: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderTopLeftRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    gap: 4,
    maxWidth: "96%",
  },
  assistantText: { color: palette.text, fontSize: 14, lineHeight: 21 },
  thinkingBubble: { backgroundColor: palette.bgElevated, borderStyle: "dashed" },
  thinkingText: { color: palette.textSecondary, fontSize: 13, lineHeight: 20 },
  errorBubble: { borderColor: tones.red.border, backgroundColor: tones.red.bg },
  toolRow: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginVertical: 4,
  },
  toolIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toolBody: { flex: 1, gap: 3 },
  toolTitle: { color: palette.text, fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  toolMetaRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolSummary: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  toolDetail: {
    color: palette.textSecondary,
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: typography.mono.fontFamily,
    backgroundColor: palette.bgElevated,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  resultCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: tones.green.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 5,
    marginVertical: spacing.xs,
  },
  resultTitleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  plainRow: { paddingVertical: 6, gap: 2 },
  plainText: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
});
