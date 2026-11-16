import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Header,
  IconButton,
  Pill,
  Screen,
  SectionTitle,
  Spinner,
} from "../components/ui";
import { useAgents, useCreateConversation } from "../hooks/queries";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { AgentInfo, Conversation } from "../types";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CreateConversationScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (conversation: Conversation) => void;
}) {
  const agentsQuery = useAgents();
  const createConversation = useCreateConversation();
  const [selected, setSelected] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState("");

  const agents = React.useMemo(
    () =>
      (agentsQuery.data?.agents ?? []).filter(
        (agent) => agent.enabled !== false && agent.role === "assistant",
      ),
    [agentsQuery.data],
  );

  React.useEffect(() => {
    if (selected || agents.length === 0) return;
    const preferred = agents.find((agent) => agent.key === "pentest") ?? agents[0];
    if (preferred) setSelected(preferred.key);
  }, [agents, selected]);

  const submit = React.useCallback(() => {
    if (!selected) {
      setError("请选择一个 Agent。");
      return;
    }
    setError("");
    createConversation.mutate(
      { agent_key: selected, title: title.trim() || undefined },
      {
        onSuccess: (result) => onCreated(result.conversation),
        onError: (mutationError) => setError(errorText(mutationError)),
      },
    );
  }, [createConversation, onCreated, selected, title]);

  const selectedAgent = agents.find((agent) => agent.key === selected);

  return (
    <Screen>
      <Header
        title="新建对话"
        subtitle="ARTEX · 选择 Agent 开始交流"
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        border
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {agentsQuery.isLoading && !agentsQuery.data ? (
          <Spinner label="加载 Agent" />
        ) : agentsQuery.error && !agentsQuery.data ? (
          <ErrorState
            message={errorText(agentsQuery.error)}
            onRetry={() => void agentsQuery.refetch()}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Card style={styles.card}>
              <FormField
                label="对话标题（可选）"
                value={title}
                onChangeText={setTitle}
                placeholder="留空由 ARTEX 自动命名"
                autoCapitalize="none"
                maxLength={200}
              />
            </Card>

            <SectionTitle
              title="选择 Agent"
              action={<Text style={typography.caption}>{agents.length} 个可用</Text>}
            />
            {agents.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="没有可用的对话 Agent"
                message="ARTEX 中启用的 assistant 角色 Agent 会出现在这里。"
              />
            ) : (
              agents.map((agent) => (
                <AgentRow
                  key={agent.key}
                  agent={agent}
                  selected={agent.key === selected}
                  onPress={() => setSelected(agent.key)}
                />
              ))
            )}

            {selectedAgent ? (
              <View style={styles.info}>
                <Ionicons name="information-circle-outline" size={16} color={palette.cyan} />
                <Text style={styles.infoText}>
                  将使用 {selectedAgent.name || selectedAgent.key} 创建对话。创建后可以直接在「对话」页继续回复。
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.error}>
                <Ionicons name="alert-circle-outline" size={16} color={palette.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Button
              title={createConversation.isPending ? "创建中…" : "创建并进入对话"}
              icon={createConversation.isPending ? undefined : "chatbubble-ellipses-outline"}
              loading={createConversation.isPending}
              disabled={!selected}
              onPress={submit}
              style={styles.submit}
            />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function AgentRow({
  agent,
  selected,
  onPress,
}: {
  agent: AgentInfo;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.agentRow,
        selected && styles.agentRowSelected,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Avatar seed={agent.key} label={agent.name} size={42} icon="chatbubble-ellipses-outline" />
      <View style={styles.agentBody}>
        <View style={styles.agentHead}>
          <Text style={styles.agentName} numberOfLines={1}>
            {agent.name || agent.key}
          </Text>
          <Pill label={agent.key} tone={selected ? "accent" : "violet"} />
        </View>
        <Text style={styles.agentDesc} numberOfLines={2}>
          {agent.description?.trim() || "ARTEX 对话 Agent"}
        </Text>
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={20}
        color={selected ? palette.accent : palette.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: 60, gap: spacing.xs },
  card: { gap: spacing.sm, marginBottom: spacing.xs },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  agentRowSelected: {
    borderColor: tones.accent.border,
    backgroundColor: tones.accent.bg,
  },
  agentBody: { flex: 1, gap: 3 },
  agentHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  agentName: { flex: 1, color: palette.text, fontSize: 14, fontWeight: "700" },
  agentDesc: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  info: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: tones.cyan.bg,
    borderWidth: 1,
    borderColor: tones.cyan.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  infoText: { flex: 1, color: palette.textSecondary, fontSize: 12, lineHeight: 18 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: tones.red.bg,
    borderWidth: 1,
    borderColor: tones.red.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: { flex: 1, color: palette.red, fontSize: 12, lineHeight: 18 },
  submit: { marginTop: spacing.sm },
});
