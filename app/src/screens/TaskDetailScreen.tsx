import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ActivityBubble } from "../components/ActivityBubble";
import { ApprovalCard } from "../components/ApprovalCard";
import {
  Card,
  Composer,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Pill,
  ProgressBar,
  Screen,
  SectionTitle,
  Segmented,
  Spinner,
  StatTile,
} from "../components/ui";
import {
  useControlTask,
  useDecideApproval,
  useSendDirective,
  useTaskConversation,
  useTaskProgress,
} from "../hooks/queries";
import {
  findingsOf,
  goalPercent,
  intentStateMeta,
  relativeTime,
  taskStatusMeta,
  totalFindings,
} from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Activity, Approval, Intent, Task } from "../types";

type DetailTab = "overview" | "conversation" | "approvals";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function IntentCard({ intent }: { intent: Intent }) {
  const state = intentStateMeta(intent.state);
  return (
    <View style={[styles.intentCard, { borderLeftColor: tones[state.tone].fg }]}>
      <View style={styles.intentHead}>
        <Text style={styles.intentId}>#{intent.id}</Text>
        <Pill label={state.label} tone={state.tone} dot />
      </View>
      <Text style={styles.intentSummary}>{intent.summary || "（暂无摘要）"}</Text>
    </View>
  );
}

export function TaskDetailScreen({
  taskId,
  initialTask,
  onBack,
}: {
  taskId: string;
  initialTask?: Task;
  onBack: () => void;
}) {
  const progressQuery = useTaskProgress(taskId);
  const [tab, setTab] = React.useState<DetailTab>("overview");
  const conversationQuery = useTaskConversation(taskId, tab === "conversation");
  const control = useControlTask(taskId);
  const directiveMutation = useSendDirective(taskId);
  const decide = useDecideApproval();
  const [directive, setDirective] = React.useState("");
  const listRef = React.useRef<FlatList<Activity>>(null);
  const nearBottom = React.useRef(true);

  const task = React.useMemo(() => {
    const detail = progressQuery.data?.task;
    if (!detail && !initialTask) return undefined;
    // The detail endpoint omits distinct_findings; keep the overview's aggregate
    // so severity chips stay accurate while the task page polls.
    return { ...initialTask, ...detail } as Task;
  }, [initialTask, progressQuery.data?.task]);
  const intents = progressQuery.data?.intents ?? [];
  const approvals = progressQuery.data?.approvals ?? [];
  const activities = conversationQuery.data?.items ?? [];
  const status = taskStatusMeta(task ?? {});
  const findings = findingsOf(task ?? { id: taskId });
  const percent = goalPercent(task ?? { id: taskId });
  const runningIntents = intents.filter((intent) => intent.state === "running").length;

  const title = task?.name?.trim() || task?.description?.trim() || "未命名任务";
  const description =
    task?.description && task.description.trim() !== title ? task.description.trim() : "";

  React.useEffect(() => {
    if (tab === "conversation" && nearBottom.current) {
      const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activities.length, tab]);

  const askControl = React.useCallback(() => {
    if (!task) return;
    const action = task.paused ? "resume" : "pause";
    Alert.alert(
      action === "pause" ? "暂停任务？" : "恢复任务？",
      title,
      [
        { text: "取消", style: "cancel" },
        {
          text: action === "pause" ? "暂停" : "恢复",
          onPress: () =>
            control.mutate(action, {
              onError: (error) => Alert.alert("操作失败", errorText(error)),
            }),
        },
      ],
    );
  }, [control, task, title]);

  const askDecide = React.useCallback(
    (approval: Approval, allow: boolean) => {
      Alert.alert(
        allow ? "批准这次调用？" : "拒绝这次调用？",
        `${approval.tool_name ?? "工具"} · ${approval.reason ?? ""}`,
        [
          { text: "取消", style: "cancel" },
          {
            text: allow ? "批准" : "拒绝",
            style: allow ? "default" : "destructive",
            onPress: () =>
              decide.mutate(
                { approval, allow },
                { onError: (error) => Alert.alert("失败", errorText(error)) },
              ),
          },
        ],
      );
    },
    [decide],
  );

  const sendDirective = React.useCallback(() => {
    const text = directive.trim();
    if (!text) return;
    Alert.alert("发送给任务主 Agent？", text, [
      { text: "取消", style: "cancel" },
      {
        text: "发送",
        onPress: () =>
          directiveMutation.mutate(text, {
            onSuccess: () => setDirective(""),
            onError: (error) => Alert.alert("发送失败", errorText(error)),
          }),
      },
    ]);
  }, [directive, directiveMutation]);

  if (progressQuery.isLoading && !task) {
    return (
      <Screen>
        <Header title={`#${taskId}`} left={<IconButton name="arrow-back" onPress={onBack} variant="plain" />} />
        <Spinner label="加载任务" />
      </Screen>
    );
  }

  if (progressQuery.error && !task) {
    return (
      <Screen>
        <Header title={`#${taskId}`} left={<IconButton name="arrow-back" onPress={onBack} variant="plain" />} />
        <ErrorState message={errorText(progressQuery.error)} onRetry={() => void progressQuery.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title={`#${taskId}`}
        subtitle={description || task?.goal || title}
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        right={
          <IconButton
            name={task?.paused ? "play" : "pause"}
            onPress={askControl}
            tone={task?.paused ? "green" : "amber"}
            disabled={!task || control.isPending}
            accessibilityLabel={task?.paused ? "恢复任务" : "暂停任务"}
          />
        }
        border
      />

      <View style={styles.segmentWrap}>
        <Segmented<DetailTab>
          value={tab}
          onChange={setTab}
          options={[
            { key: "overview", label: "总览" },
            { key: "conversation", label: "对话", count: activities.length },
            { key: "approvals", label: "审批", count: approvals.length },
          ]}
        />
      </View>

      {progressQuery.error ? (
        <ErrorState message={errorText(progressQuery.error)} onRetry={() => void progressQuery.refetch()} />
      ) : null}

      {tab === "overview" ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, { borderTopColor: tones[status.tone].fg }]}>
            <View style={styles.heroHead}>
              <Pill label={status.label} tone={status.tone} dot />
              <Text style={typography.caption}>
                {relativeTime(task?.updated_at ?? task?.created_at) || `task ${taskId}`}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{title}</Text>
            {description ? <Text style={styles.heroDesc}>{description}</Text> : null}
            {task?.goal ? (
              <View style={styles.goalBox}>
                <Text style={typography.label}>目标</Text>
                <Text style={styles.goalText}>{task.goal}</Text>
              </View>
            ) : null}

            <View style={styles.goalRow}>
              <Text style={styles.goalLabel}>
                目标进度 {task?.goals_met ?? 0}/{task?.goals_total ?? 0}
              </Text>
              <Text style={styles.goalPct}>{Math.round(percent * 100)}%</Text>
            </View>
            <ProgressBar value={percent} tone={status.tone} height={7} />

            <View style={styles.statsRow}>
              <StatTile
                label="目标达成"
                value={`${task?.goals_met ?? 0}/${task?.goals_total ?? 0}`}
                tone="accent"
                icon="flag-outline"
              />
              <StatTile label="进行中意图" value={runningIntents} tone="green" icon="pulse" />
              <StatTile label="发现" value={totalFindings(task ?? { id: taskId })} tone="cyan" icon="bug-outline" />
            </View>
            {(findings.critical ?? 0) + (findings.high ?? 0) > 0 ? (
              <View style={styles.severityRow}>
                {(findings.critical ?? 0) > 0 ? (
                  <Pill label={`严重 ${findings.critical}`} tone="red" />
                ) : null}
                {(findings.high ?? 0) > 0 ? <Pill label={`高危 ${findings.high}`} tone="amber" /> : null}
                {(findings.medium ?? 0) > 0 ? (
                  <Pill label={`中危 ${findings.medium}`} tone="cyan" />
                ) : null}
                {(findings.low ?? 0) > 0 ? <Pill label={`低危 ${findings.low}`} tone="muted" /> : null}
              </View>
            ) : null}
          </View>

          {task?.hard_requirement ? (
            <Card tone="amber" style={styles.warnCard}>
              <View style={styles.warnHead}>
                <Ionicons name="lock-closed-outline" size={14} color={palette.amber} />
                <Text style={typography.label}>硬性要求 · 只读</Text>
              </View>
              <Text style={styles.warnText}>{task.hard_requirement}</Text>
            </Card>
          ) : null}

          <SectionTitle
            title="当前方向"
            action={<Text style={typography.caption}>{intents.length} 个意图</Text>}
          />
          {intents.length === 0 ? (
            <EmptyState icon="git-branch-outline" title="暂无意图" message="任务规划器还没有产出探索方向。" />
          ) : (
            <View style={styles.intentList}>
              {intents.map((intent) => (
                <IntentCard key={intent.id} intent={intent} />
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}

      {tab === "conversation" ? (
        <View style={styles.flex}>
          {conversationQuery.isLoading && activities.length === 0 ? (
            <Spinner label="加载主 Agent 对话" />
          ) : conversationQuery.error && activities.length === 0 ? (
            <ErrorState
              message={errorText(conversationQuery.error)}
              onRetry={() => void conversationQuery.refetch()}
            />
          ) : (
            <FlatList
              ref={listRef}
              data={activities}
              keyExtractor={(item) => String(item.seq)}
              contentContainerStyle={styles.activityList}
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              maxToRenderPerBatch={10}
              windowSize={9}
              onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
                const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                nearBottom.current =
                  contentSize.height - (contentOffset.y + layoutMeasurement.height) < 140;
              }}
              onContentSizeChange={() => {
                if (nearBottom.current) listRef.current?.scrollToEnd({ animated: true });
              }}
              renderItem={({ item }) => <ActivityBubble item={item} source={{ type: "task", id: taskId }} />}
              ListEmptyComponent={
                conversationQuery.error ? undefined : (
                  <EmptyState
                    icon="chatbubbles-outline"
                    title="暂无对话"
                    message="任务主 Agent 的思考、工具调用和结果会实时出现在这里。"
                  />
                )
              }
            />
          )}
          <Composer
            value={directive}
            onChangeText={setDirective}
            onSend={sendDirective}
            placeholder="给任务主 Agent 发指令，例如：只测登录接口"
            sending={directiveMutation.isPending}
            hint="指令会以 OPERATOR DIRECTIVE 注入任务主 Agent · 发送前需要确认"
          />
        </View>
      ) : null}

      {tab === "approvals" ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {approvals.length === 0 ? (
            <EmptyState
              icon="shield-checkmark-outline"
              title="没有待审批"
              message="任务需要人工确认的敏感工具调用会出现在这里。"
            />
          ) : (
            approvals.map((approval) => (
              <ApprovalCard
                key={String(approval.id)}
                approval={approval}
                onDecide={(allow) => askDecide(approval, allow)}
                busy={decide.isPending}
              />
            ))
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmentWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xs },
  scroll: { padding: spacing.md, paddingBottom: 140, gap: spacing.sm },
  hero: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    borderTopWidth: 3,
    padding: spacing.md,
    gap: spacing.xs,
  },
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTitle: {
    color: palette.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  heroDesc: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  goalBox: {
    backgroundColor: palette.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
    gap: 3,
    marginTop: 2,
  },
  goalText: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  goalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  goalLabel: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  goalPct: { color: palette.textSecondary, fontSize: 11, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  severityRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  warnCard: { gap: 4 },
  warnHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  warnText: { color: palette.textSecondary, fontSize: 13, lineHeight: 20 },
  intentList: { gap: spacing.xs },
  intentCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    padding: spacing.sm,
    gap: 5,
  },
  intentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  intentId: { color: palette.muted, fontSize: 11, fontWeight: "700", fontFamily: typography.mono.fontFamily },
  intentSummary: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  activityList: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md, gap: 2 },
});
