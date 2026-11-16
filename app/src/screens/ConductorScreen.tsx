import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Avatar,
  Button,
  Composer,
  Header,
  IconButton,
  Screen,
} from "../components/ui";
import {
  useConductorHistory,
  useConductorMessage,
  useResolveConfirmation,
} from "../hooks/queries";
import { clockTime } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Confirmation } from "../types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts?: string;
  confirmations?: Confirmation[];
  error?: boolean;
};

const SUGGESTIONS = [
  "现在有哪些任务在运行？",
  "汇总一下待审批的工具调用",
  "看看最近任务有什么新发现",
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ConductorScreen({ onBack }: { onBack: () => void }) {
  const history = useConductorHistory(true);
  const conductor = useConductorMessage();
  const resolve = useResolveConfirmation();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const seeded = React.useRef(false);
  const listRef = React.useRef<FlatList<ChatMessage>>(null);

  React.useEffect(() => {
    if (seeded.current || !history.data) return;
    seeded.current = true;
    const restored: ChatMessage[] = history.data.messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-30)
      .map((message) => ({
        id: `hist-${message.id}`,
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
        ts: message.created_at,
      }));
    if (restored.length > 0) setMessages(restored);
  }, [history.data]);

  React.useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length, conductor.isPending]);

  const sendMessage = React.useCallback(
    (raw?: string) => {
      const text = (raw ?? draft).trim();
      if (!text || conductor.isPending) return;
      setDraft("");
      setNotice("");
      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        ts: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      conductor.mutate(text, {
        onSuccess: (data) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: data.reply || "（模型没有返回内容）",
              ts: new Date().toISOString(),
              confirmations: data.confirmations ?? [],
            },
          ]);
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: `主控 AI 请求失败：${errorText(error)}`,
              ts: new Date().toISOString(),
              error: true,
            },
          ]);
        },
      });
    },
    [conductor, draft],
  );

  const settleConfirmation = React.useCallback(
    (messageId: string, confirmation: Confirmation, approve: boolean) => {
      resolve.mutate(
        { id: confirmation.confirmation_id, approve },
        {
          onSuccess: (result) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      confirmations: (message.confirmations ?? []).filter(
                        (item) => item.confirmation_id !== confirmation.confirmation_id,
                      ),
                    }
                  : message,
              ),
            );
            setNotice(
              approve
                ? `已执行：${confirmation.summary}${result.state ? `（${result.state}）` : ""}`
                : `已取消：${confirmation.summary}`,
            );
          },
          onError: (error) => Alert.alert("执行失败", errorText(error)),
        },
      );
    },
    [resolve],
  );

  return (
    <Screen>
      <Header
        title="主控 AI"
        subtitle="DeepSeek · 查询直接回答，写操作需要确认"
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        right={<IconButton name="trash-outline" onPress={() => setMessages([])} variant="plain" accessibilityLabel="清空本屏" />}
        border
      />
      {notice ? (
        <View style={styles.notice}>
          <Ionicons name="checkmark-circle-outline" size={14} color={palette.green} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={styles.messageBlock}>
              {item.role === "user" ? (
                <View style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText} selectable>
                      {item.content}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.assistantRow}>
                  <Avatar seed="conductor" label="AI" size={32} icon="sparkles" />
                  <View style={styles.assistantBody}>
                    <View style={styles.assistantHead}>
                      <Text style={styles.worker}>主控 AI</Text>
                      <Text style={styles.meta}>{clockTime(item.ts)}</Text>
                    </View>
                    <View style={[styles.assistantBubble, item.error && styles.errorBubble]}>
                      <Text
                        style={[styles.assistantText, item.error && { color: palette.red }]}
                        selectable
                      >
                        {item.content}
                      </Text>
                    </View>
                    {(item.confirmations ?? []).map((confirmation) => (
                      <View key={confirmation.confirmation_id} style={styles.confirmCard}>
                        <View style={styles.confirmHead}>
                          <Ionicons name="shield-half-outline" size={14} color={palette.amber} />
                          <Text style={styles.confirmTitle}>等待确认</Text>
                        </View>
                        <Text style={styles.confirmText}>{confirmation.summary}</Text>
                        <Text style={styles.meta}>确认后 BFF 才会调用 ARTEX 执行</Text>
                        <View style={styles.confirmActions}>
                          <Button
                            title="确认执行"
                            icon="checkmark"
                            size="sm"
                            loading={resolve.isPending}
                            onPress={() =>
                              settleConfirmation(item.id, confirmation, true)
                            }
                            style={styles.flex}
                          />
                          <Button
                            title="取消"
                            variant="secondary"
                            size="sm"
                            disabled={resolve.isPending}
                            onPress={() =>
                              settleConfirmation(item.id, confirmation, false)
                            }
                            style={styles.flex}
                          />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
          ListHeaderComponent={
            history.isLoading && messages.length === 0 ? (
              <View style={styles.loading}>
                <ActivityIndicator color={palette.accent} />
                <Text style={typography.caption}>加载主控历史</Text>
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles" size={26} color={palette.accent} />
              </View>
              <Text style={[typography.heading, { textAlign: "center" }]}>主控 AI 已就绪</Text>
              <Text style={[typography.caption, styles.emptyText]}>
                它会先查询 ARTEX 的真实数据再回答。涉及指令、审批、暂停的写操作，会先要求你在手机上确认。
              </Text>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => sendMessage(suggestion)}
                    style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="arrow-forward" size={12} color={palette.accent} />
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
        />
        {conductor.isPending ? (
          <View style={styles.typing}>
            <ActivityIndicator size="small" color={palette.accent} />
            <Text style={typography.caption}>主控 AI 正在查询 ARTEX…</Text>
          </View>
        ) : null}
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={() => sendMessage()}
          placeholder="问进度、发指令、审批…"
          sending={conductor.isPending}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tones.green.bg,
    borderBottomWidth: 1,
    borderBottomColor: tones.green.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  noticeText: { flex: 1, color: tones.green.fg, fontSize: 12, fontWeight: "600" },
  list: { padding: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  messageBlock: { gap: 4 },
  userRow: { alignItems: "flex-end" },
  userBubble: {
    maxWidth: "86%",
    backgroundColor: tones.accent.bg,
    borderWidth: 1,
    borderColor: tones.accent.border,
    borderRadius: radius.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  userText: { color: palette.text, fontSize: 14, lineHeight: 21 },
  assistantRow: { flexDirection: "row", gap: spacing.xs },
  assistantBody: { flex: 1, gap: 4 },
  assistantHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  worker: { color: palette.textSecondary, fontSize: 11, fontWeight: "800" },
  meta: { color: palette.muted, fontSize: 10, lineHeight: 14 },
  assistantBubble: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    borderTopLeftRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    maxWidth: "96%",
  },
  assistantText: { color: palette.text, fontSize: 14, lineHeight: 21 },
  errorBubble: { borderColor: tones.red.border, backgroundColor: tones.red.bg },
  confirmCard: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: tones.amber.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 5,
    marginTop: 4,
  },
  confirmHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  confirmTitle: { color: palette.amber, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  confirmText: { color: palette.text, fontSize: 13, lineHeight: 19 },
  confirmActions: { flexDirection: "row", gap: spacing.xs, marginTop: 4 },
  loading: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xl },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.xs },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tones.accent.bg,
    borderWidth: 1,
    borderColor: tones.accent.border,
    marginBottom: spacing.sm,
  },
  emptyText: { textAlign: "center", maxWidth: 300, lineHeight: 18 },
  suggestions: { alignSelf: "stretch", gap: spacing.xs, marginTop: spacing.md },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  suggestionText: { color: palette.textSecondary, fontSize: 13 },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
});
