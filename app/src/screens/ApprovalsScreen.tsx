import React from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { ApprovalCard } from "../components/ApprovalCard";
import {
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Screen,
  Spinner,
} from "../components/ui";
import { useApprovals, useDecideApproval } from "../hooks/queries";
import { palette, spacing } from "../theme";
import type { Approval } from "../types";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ApprovalsScreen({ onBack }: { onBack: () => void }) {
  const approvalsQuery = useApprovals();
  const decide = useDecideApproval();
  const approvals = approvalsQuery.data?.approvals ?? [];

  const ask = React.useCallback(
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

  return (
    <Screen>
      <Header
        title="审批收件箱"
        subtitle={`${approvals.length} 条待处理 · 来自 ARTEX 工具拦截`}
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        right={
          <IconButton
            name="refresh"
            onPress={() => void approvalsQuery.refetch()}
            accessibilityLabel="刷新审批"
          />
        }
        border
      />
      {approvalsQuery.isLoading && !approvalsQuery.data ? (
        <Spinner label="加载审批" />
      ) : (
        <FlatList
          data={approvals}
          keyExtractor={(approval) => String(approval.id)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={approvalsQuery.isRefetching}
              onRefresh={() => void approvalsQuery.refetch()}
              tintColor={palette.accent}
              colors={[palette.accent]}
            />
          }
          ListHeaderComponent={
            approvalsQuery.error ? (
              <ErrorState
                message={errorText(approvalsQuery.error)}
                onRetry={() => void approvalsQuery.refetch()}
              />
            ) : undefined
          }
          renderItem={({ item }) => (
            <ApprovalCard
              approval={item}
              showTask
              busy={decide.isPending}
              onDecide={(allow) => ask(item, allow)}
            />
          )}
          ListEmptyComponent={
            approvalsQuery.error ? undefined : (
              <EmptyState
                icon="shield-checkmark-outline"
                title="没有待审批"
                message="ARTEX 需要人工确认的工具调用会实时出现在这里。"
              />
            )
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingBottom: 140 },
});
