import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import {
  Avatar,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Pill,
  Screen,
  SearchField,
  Spinner,
} from "../components/ui";
import { useConversations } from "../hooks/queries";
import { relativeTime } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Conversation } from "../types";

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: Conversation;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={conversation.title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      <Avatar seed={conversation.agent_key} label={conversation.agent_key} size={44} icon="chatbubble-ellipses-outline" />
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {conversation.title || "未命名对话"}
          </Text>
          {conversation.running ? <Pill label="运行中" tone="green" dot /> : null}
          {conversation.pinned ? (
            <Ionicons name="pin" size={12} color={palette.amber} />
          ) : null}
        </View>
        <View style={styles.rowMeta}>
          <View style={styles.agentChip}>
            <Ionicons name="hardware-chip-outline" size={10} color={palette.violet} />
            <Text style={styles.agentText}>{conversation.agent_key}</Text>
          </View>
          <Text style={styles.metaText}>
            {relativeTime(conversation.updated_at ?? conversation.created_at) || `#${conversation.id}`}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.muted} />
    </Pressable>
  );
}

export function ChatsScreen({
  onOpenConversation,
  onCreateConversation,
}: {
  onOpenConversation: (conversation: Conversation) => void;
  onCreateConversation: () => void;
}) {
  const conversationsQuery = useConversations();
  const [search, setSearch] = React.useState("");
  const conversations = conversationsQuery.data?.conversations ?? [];

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations
      .filter((conversation) => {
        if (!needle) return true;
        return [conversation.title, conversation.agent_key, String(conversation.id)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        if (a.running !== b.running) return a.running ? -1 : 1;
        return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
      });
  }, [conversations, search]);

  if (conversationsQuery.isLoading && !conversationsQuery.data) {
    return (
      <Screen>
        <Header title="对话" subtitle="ARTEX 会话" large />
        <Spinner label="加载会话" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="对话"
        subtitle="ARTEX 会话 · 与 Agent 直接交流"
        large
        right={
          <>
            <IconButton
              name="add"
              onPress={onCreateConversation}
              variant="solid"
              accessibilityLabel="新建对话"
            />
            <IconButton
              name="refresh"
              onPress={() => void conversationsQuery.refetch()}
              accessibilityLabel="刷新会话"
            />
          </>
        }
      />
      <FlatList
        data={filtered}
        keyExtractor={(conversation) => String(conversation.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        refreshControl={
          <RefreshControl
            refreshing={conversationsQuery.isRefetching}
            onRefresh={() => void conversationsQuery.refetch()}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="搜索对话标题或 Agent"
            />
            {conversationsQuery.error ? (
              <ErrorState
                message={
                  conversationsQuery.error instanceof Error
                    ? conversationsQuery.error.message
                    : String(conversationsQuery.error)
                }
                onRetry={() => void conversationsQuery.refetch()}
              />
            ) : null}
            <View style={styles.summaryRow}>
              <Text style={typography.label}>会话</Text>
              <Text style={typography.caption}>
                {filtered.length} / {conversations.length}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ConversationRow conversation={item} onPress={() => onOpenConversation(item)} />
        )}
        ListEmptyComponent={
          conversationsQuery.error ? undefined : conversations.length === 0 ? (
            <EmptyState
              icon="chatbubbles-outline"
              title="还没有 ARTEX 会话"
              message="在 ARTEX 中发起对话后，这里会同步显示，并支持在手机上继续回复。"
            />
          ) : (
            <EmptyState icon="search-outline" title="没有匹配的会话" message="换个关键词试试。" />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.md, paddingBottom: 140 },
  headerBlock: { gap: spacing.sm, paddingBottom: spacing.xs },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
  },
  rowBody: { flex: 1, gap: 5 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  agentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: tones.violet.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  agentText: { color: palette.violet, fontSize: 10, fontWeight: "700" },
  metaText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
});
