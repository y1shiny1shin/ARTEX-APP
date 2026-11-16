import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Pill,
  ProgressBar,
  Screen,
  SearchField,
  Segmented,
  Spinner,
  StatTile,
} from "../components/ui";
import { useOverview } from "../hooks/queries";
import {
  findingsOf,
  goalPercent,
  relativeTime,
  taskStatusMeta,
  totalFindings,
} from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Task } from "../types";

type TaskFilter = "all" | "running" | "paused" | "done";

function rank(task: Task): number {
  if (task.status === "running" && !task.paused) return 0;
  if (task.paused) return 1;
  if (task.status === "queued" || task.status === "pending") return 2;
  if (task.status === "done" || task.status === "completed") return 4;
  if (task.status === "failed" || task.status === "timeout") return 3;
  return 2;
}

function TaskCard({ task, onPress }: { task: Task; onPress: () => void }) {
  const status = taskStatusMeta(task);
  const findings = findingsOf(task);
  const percent = goalPercent(task);
  const title = task.name?.trim() || task.description?.trim() || `任务 #${task.id}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.taskCard,
        { borderLeftColor: tones[status.tone].fg },
        pressed && { opacity: 0.82 },
      ]}
    >
      <View style={styles.taskTouch}>
        <View style={styles.taskHead}>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {title}
          </Text>
          <Pill label={status.label} tone={status.tone} dot />
        </View>
        {task.description && task.description !== title ? (
          <Text style={styles.taskDesc} numberOfLines={2}>
            {task.description}
          </Text>
        ) : null}

        <View style={styles.goalRow}>
          <Text style={styles.goalLabel}>
            目标 {task.goals_met ?? 0}/{task.goals_total ?? 0}
          </Text>
          <Text style={styles.goalPct}>{Math.round(percent * 100)}%</Text>
        </View>
        <ProgressBar value={percent} tone={status.tone} />

        <View style={styles.taskMetaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="bug-outline" size={12} color={palette.muted} />
            <Text style={styles.metaText}>{totalFindings(task)} 发现</Text>
          </View>
          {(findings.critical ?? 0) > 0 ? (
            <Text style={[styles.metaText, { color: palette.red }]}>
              严重 {findings.critical}
            </Text>
          ) : null}
          {(findings.high ?? 0) > 0 ? (
            <Text style={[styles.metaText, { color: palette.amber }]}>
              高危 {findings.high}
            </Text>
          ) : null}
          {(task.in_flight ?? 0) > 0 ? (
            <Text style={[styles.metaText, { color: palette.cyan }]}>
              进行中 {task.in_flight}
            </Text>
          ) : null}
          <View style={styles.metaSpacer} />
          <Text style={styles.metaText}>#{task.id}</Text>
          <Text style={styles.metaText}>{relativeTime(task.updated_at ?? task.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function TasksScreen({
  onOpenTask,
  onOpenApprovals,
  onOpenConductor,
  onCreateTask,
}: {
  onOpenTask: (task: Task) => void;
  onOpenApprovals: () => void;
  onOpenConductor: () => void;
  onCreateTask: () => void;
}) {
  const overview = useOverview();
  const tasks = overview.data?.tasks ?? [];
  const approvals = overview.data?.counts?.approvals ?? overview.data?.approvals?.length ?? 0;
  const running = overview.data?.counts?.running ?? 0;
  const [filter, setFilter] = React.useState<TaskFilter>("all");
  const [search, setSearch] = React.useState("");

  const totals = React.useMemo(() => {
    let findings = 0;
    let critical = 0;
    for (const task of tasks) {
      findings += totalFindings(task);
      critical += findingsOf(task).critical ?? 0;
    }
    return { findings, critical };
  }, [tasks]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks
      .filter((task) => {
        if (filter === "running") return task.status === "running" && !task.paused;
        if (filter === "paused") return Boolean(task.paused);
        if (filter === "done") return task.status === "done" || task.status === "completed";
        return true;
      })
      .filter((task) => {
        if (!needle) return true;
        return [task.name, task.description, task.goal, task.id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const delta = rank(a) - rank(b);
        if (delta !== 0) return delta;
        return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
      });
  }, [filter, search, tasks]);

  const counts = React.useMemo(
    () => ({
      running: tasks.filter((t) => t.status === "running" && !t.paused).length,
      paused: tasks.filter((t) => t.paused).length,
      done: tasks.filter((t) => t.status === "done" || t.status === "completed").length,
    }),
    [tasks],
  );

  if (overview.isLoading && !overview.data) {
    return (
      <Screen>
        <Header
          title="RyAgent"
          subtitle="个人 Agent 控制台"
          large
          right={
            <>
              <IconButton
                name="add"
                onPress={onCreateTask}
                variant="solid"
                accessibilityLabel="新建任务"
              />
              <IconButton name="sparkles" onPress={onOpenConductor} accessibilityLabel="主控 AI" />
              <IconButton name="notifications-outline" onPress={onOpenApprovals} badge={approvals > 0} />
            </>
          }
        />
        <Spinner label="正在连接 ARTEX" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="RyAgent"
        subtitle="个人 Agent 控制台"
        large
        right={
          <>
            <IconButton
              name="add"
              onPress={onCreateTask}
              variant="solid"
              accessibilityLabel="新建任务"
            />
            <IconButton name="sparkles" onPress={onOpenConductor} accessibilityLabel="主控 AI" />
            <IconButton
              name="notifications-outline"
              onPress={onOpenApprovals}
              badge={approvals > 0}
              accessibilityLabel="审批收件箱"
            />
          </>
        }
      />
      <FlatList
        data={filtered}
        keyExtractor={(task) => String(task.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={overview.isRefetching}
            onRefresh={() => void overview.refetch()}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.hero}>
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={styles.heroGlowA} />
                <View style={styles.heroGlowB} />
              </View>
              <View style={styles.heroHead}>
                <Pill label={running > 0 ? "LIVE" : "IDLE"} tone={running > 0 ? "green" : "muted"} dot />
                <Text style={typography.caption}>ARTEX 引擎</Text>
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.heroValue}>{running}</Text>
                <View style={styles.heroTextWrap}>
                  <Text style={styles.heroTitle}>{running > 0 ? "个任务运行中" : "当前没有运行中的任务"}</Text>
                  <Text style={styles.metaText}>
                    共 {tasks.length} 个任务 · {approvals} 条待审批
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <StatTile label="运行中" value={counts.running} tone="green" icon="pulse" />
                <StatTile label="待审批" value={approvals} tone="amber" icon="shield-checkmark-outline" />
                <StatTile label="发现" value={totals.findings} tone="cyan" icon="bug-outline" />
              </View>
            </View>

            {overview.error ? (
              <ErrorState
                message={overview.error instanceof Error ? overview.error.message : String(overview.error)}
                onRetry={() => void overview.refetch()}
              />
            ) : null}

            <SearchField value={search} onChangeText={setSearch} placeholder="搜索任务、目标或编号" />

            <Segmented<TaskFilter>
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "全部", count: tasks.length },
                { key: "running", label: "运行中", count: counts.running },
                { key: "paused", label: "已暂停", count: counts.paused },
                { key: "done", label: "已完成", count: counts.done },
              ]}
            />

            <View style={styles.sectionRow}>
              <Text style={typography.label}>任务</Text>
              <Text style={typography.caption}>{filtered.length} 个</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TaskCard task={item} onPress={() => onOpenTask(item)} />
        )}
        ListEmptyComponent={
          overview.error && tasks.length === 0 ? undefined : tasks.length === 0 ? (
            <EmptyState
              icon="planet-outline"
              title="还没有任务"
              message="在 ARTEX 中创建渗透任务后，这里会实时展示目标进度、发现和主 Agent 对话。"
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="没有匹配的任务"
              message="换一个筛选条件或搜索关键词试试。"
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: 140,
    gap: spacing.sm,
  },
  headerBlock: { gap: spacing.sm, paddingTop: spacing.xs },
  hero: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    overflow: "hidden",
    gap: spacing.sm,
  },
  heroGlowA: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: palette.accent,
    opacity: 0.14,
    top: -120,
    right: -60,
  },
  heroGlowB: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: palette.cyan,
    opacity: 0.06,
    bottom: -80,
    left: -40,
  },
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroBody: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  heroValue: {
    color: palette.text,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: "800",
    letterSpacing: -2,
  },
  heroTextWrap: { flex: 1, paddingBottom: 8, gap: 2 },
  heroTitle: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: spacing.xs, marginTop: 2 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  taskCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  taskTouch: { padding: spacing.md, gap: spacing.xs },
  taskHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  taskTitle: { flex: 1, color: palette.text, fontSize: 15, fontWeight: "700", letterSpacing: -0.1 },
  taskDesc: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },
  goalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  goalLabel: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  goalPct: { color: palette.textSecondary, fontSize: 11, fontWeight: "700" },
  taskMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: 2,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  metaSpacer: { flex: 1 },
});
