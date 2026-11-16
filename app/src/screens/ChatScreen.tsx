import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ActivityBubble } from "../components/ActivityBubble";
import {
  Composer,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Pill,
  Screen,
  Spinner,
} from "../components/ui";
import { useConversation, useSendConversation } from "../hooks/queries";
import { palette, spacing, typography } from "../theme";
import type { Activity } from "../types";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ChatScreen({
  conversationId,
  initialTitle,
  onBack,
}: {
  conversationId: number;
  initialTitle?: string;
  onBack: () => void;
}) {
  const conversationQuery = useConversation(conversationId);
  const send = useSendConversation(conversationId);
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<FlatList<Activity>>(null);

  const items = conversationQuery.data?.items ?? [];
  const running = conversationQuery.data?.running ?? false;
  const reversed = React.useMemo(() => [...items].reverse(), [items]);

  const sendMessage = React.useCallback(() => {
    const text = draft.trim();
    if (!text || send.isPending || running) return;
    send.mutate(text, {
      onSuccess: () => {
        setDraft("");
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
      onError: (error) => Alert.alert("发送失败", errorText(error)),
    });
  }, [draft, running, send]);

  return (
    <Screen>
      <Header
        title={initialTitle || `会话 #${conversationId}`}
        subtitle={running ? "Agent 正在回复…" : "ARTEX 会话"}
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        right={
          <>
            {running ? <Pill label="LIVE" tone="green" dot /> : null}
            <IconButton
              name="refresh"
              onPress={() => void conversationQuery.refetch()}
              accessibilityLabel="刷新会话"
            />
          </>
        }
        border
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {conversationQuery.isLoading && items.length === 0 ? (
          <Spinner label="加载对话" />
        ) : conversationQuery.error && items.length === 0 ? (
          <ErrorState
            message={errorText(conversationQuery.error)}
            onRetry={() => void conversationQuery.refetch()}
          />
        ) : (
          <FlatList
            ref={listRef}
            inverted
            data={reversed}
            keyExtractor={(item) => String(item.seq)}
            contentContainerStyle={[styles.list, reversed.length === 0 && styles.listEmpty]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={9}
            renderItem={({ item }) => (
              <ActivityBubble item={item} source={{ type: "conversation", id: conversationId }} />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="chatbubble-ellipses-outline"
                title="对话是空的"
                message="在下方输入消息，开始与 ARTEX Agent 交流。"
              />
            }
          />
        )}

        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={sendMessage}
          placeholder={running ? "Agent 正在回复…" : "发消息给 ARTEX Agent"}
          sending={send.isPending}
          disabled={running}
          hint={running ? "本轮回复完成后可继续发送" : undefined}
        />
        <View style={styles.footerNote}>
          <Ionicons name="lock-closed-outline" size={10} color={palette.muted} />
          <Text style={typography.caption}>会话由 ARTEX 持久化，BFF 仅做转发</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  footerNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingBottom: spacing.xs,
    backgroundColor: palette.bgElevated,
  },
});
