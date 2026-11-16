import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import {
  Button,
  Card,
  FormField,
  Header,
  IconButton,
  Screen,
  SectionTitle,
  Stepper,
} from "../components/ui";
import { useCreateTask } from "../hooks/queries";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { Task } from "../types";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CreateTaskScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (task: Task) => void;
}) {
  const createTask = useCreateTask();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [hardRequirement, setHardRequirement] = React.useState("");
  const [workerCount, setWorkerCount] = React.useState(0);
  const [timeoutMinutes, setTimeoutMinutes] = React.useState("");
  const [seedFirstIntent, setSeedFirstIntent] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = React.useCallback(() => {
    const desc = description.trim();
    const target = goal.trim();
    if (!desc) {
      setError("请填写任务描述：要测试什么目标。");
      return;
    }
    if (!target) {
      setError("请填写任务目标：做到什么算完成。");
      return;
    }
    setError("");
    const minutes = Number.parseInt(timeoutMinutes || "0", 10);
    const timeoutSeconds = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 0;
    Alert.alert("创建并启动任务？", desc, [
      { text: "取消", style: "cancel" },
      {
        text: "创建",
        onPress: () =>
          createTask.mutate(
            {
              name: name.trim() || undefined,
              description: desc,
              goal: target,
              hard_requirement: hardRequirement.trim() || undefined,
              worker_count: workerCount > 0 ? workerCount : undefined,
              timeout_seconds: timeoutSeconds > 0 ? timeoutSeconds : undefined,
              seed_first_intent: seedFirstIntent,
            },
            {
              onSuccess: (result) => onCreated(result.task),
              onError: (mutationError) => setError(errorText(mutationError)),
            },
          ),
      },
    ]);
  }, [
    createTask,
    description,
    goal,
    hardRequirement,
    name,
    onCreated,
    seedFirstIntent,
    timeoutMinutes,
    workerCount,
  ]);

  return (
    <Screen>
      <Header
        title="新建任务"
        subtitle="ARTEX · 创建后立即启动"
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        border
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            <FormField
              label="任务名称（可选）"
              value={name}
              onChangeText={setName}
              placeholder="例如：测试 xxx 站点"
              autoCapitalize="none"
              maxLength={200}
            />
            <FormField
              label="任务描述（必填）"
              value={description}
              onChangeText={setDescription}
              placeholder="测试什么目标、范围、入口，例如：对 http://target 进行渗透测试"
              multiline
              maxLength={4000}
            />
            <FormField
              label="任务目标（必填）"
              value={goal}
              onChangeText={setGoal}
              placeholder="做到什么算完成，例如：获取 shell 并证明"
              multiline
              maxLength={4000}
            />
          </Card>

          <SectionTitle title="运行控制" />
          <Card style={styles.card}>
            <FormField
              label="硬性要求（只读）"
              value={hardRequirement}
              onChangeText={setHardRequirement}
              placeholder="例如：禁止破坏性操作、不要修改线上数据"
              multiline
              maxLength={20000}
              hint="Agent 无法修改硬性要求；写入后任务会把它作为约束。"
            />

            <View style={styles.rowBetween}>
              <View style={styles.rowLabel}>
                <Text style={typography.body}>Worker 数量</Text>
                <Text style={typography.caption}>0 表示使用全局默认</Text>
              </View>
              <Stepper value={workerCount} onChange={setWorkerCount} min={0} max={50} />
            </View>

            <FormField
              label="任务超时（分钟）"
              value={timeoutMinutes}
              onChangeText={(value) => setTimeoutMinutes(value.replace(/[^0-9]/g, ""))}
              placeholder="留空或 0 表示不限时"
              keyboardType="number-pad"
            />

            <View style={styles.rowBetween}>
              <View style={styles.rowLabel}>
                <Text style={typography.body}>直接下发种子意图</Text>
                <Text style={typography.caption}>跳过首轮规划，Worker 立即开跑</Text>
              </View>
              <Switch
                value={seedFirstIntent}
                onValueChange={setSeedFirstIntent}
                trackColor={{ false: palette.surfaceRaised, true: tones.accent.border }}
                thumbColor={seedFirstIntent ? palette.accent : palette.muted}
              />
            </View>
          </Card>

          <View style={styles.info}>
            <Ionicons name="information-circle-outline" size={16} color={palette.cyan} />
            <Text style={styles.infoText}>
              创建后 ARTEX 会立即启动 planner 与 worker。目标分解在后台可见地进行，任务进度会实时出现在任务页。
            </Text>
          </View>

          {error ? (
            <View style={styles.error}>
              <Ionicons name="alert-circle-outline" size={16} color={palette.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title={createTask.isPending ? "创建中…" : "创建并启动任务"}
            icon={createTask.isPending ? undefined : "rocket-outline"}
            loading={createTask.isPending}
            onPress={submit}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: 60, gap: spacing.sm },
  card: { gap: spacing.sm },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rowLabel: { flex: 1, gap: 2 },
  info: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: tones.cyan.bg,
    borderWidth: 1,
    borderColor: tones.cyan.border,
    borderRadius: radius.md,
    padding: spacing.sm,
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
  submit: { marginTop: spacing.xs },
});
