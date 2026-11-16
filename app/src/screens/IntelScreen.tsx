import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { IntelCard } from "../components/IntelCard";
import {
  Button,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Pill,
  Screen,
  SearchField,
  Segmented,
  Spinner,
  StatTile,
} from "../components/ui";
import { useIntel, useRefreshIntel } from "../hooks/queries";
import { formatMinutes, isWithinHours, relativeTime } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { IntelItem } from "../types";

function matchesSearch(item: IntelItem, needle: string): boolean {
  if (!needle) return true;
  return [item.title, item.summary, item.cve, item.vendor, item.product, item.source, ...(item.tags ?? [])]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function IntelScreen({ onBack }: { onBack: () => void }) {
  const [source, setSource] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const intelQuery = useIntel("article");
  const refresh = useRefreshIntel();

  const items = intelQuery.data?.items ?? [];
  const counts = intelQuery.data?.counts ?? {};
  const sources = intelQuery.data?.sources ?? [];
  const fresh = items.filter((item) => isWithinHours(item.first_seen, 24)).length;

  const sourceOptions = React.useMemo(() => {
    const countsBySource = new Map<string, number>();
    for (const item of items) {
      countsBySource.set(item.source, (countsBySource.get(item.source) ?? 0) + 1);
    }
    return sources
      .filter((entry) => countsBySource.has(entry.key))
      .sort((a, b) => (countsBySource.get(b.key) ?? 0) - (countsBySource.get(a.key) ?? 0));
  }, [items, sources]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      return matchesSearch(item, needle);
    });
  }, [items, search, source]);

  const runRefresh = React.useCallback(() => {
    setNotice("");
    refresh.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          result.added > 0
            ? `新增 ${result.added} 条安全情报，已按来源/链接去重`
            : "暂无新情报；各来源有 30 分钟到 6 小时的抓取冷却",
        );
      },
      onError: (error) => Alert.alert("刷新失败", error instanceof Error ? error.message : String(error)),
    });
  }, [refresh]);

  if (intelQuery.isLoading && !intelQuery.data) {
    return (
      <Screen>
        <Header
          title="情报中心"
          subtitle="技术文章 · 全量拉取"
          left={<IconButton name="arrow-back" onPress={onBack} variant="plain" />}
        />
        <Spinner label="加载安全情报" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="情报中心"
        subtitle="技术文章 · 全量拉取"
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        right={
          <IconButton
            name="sync-outline"
            onPress={runRefresh}
            disabled={refresh.isPending}
            accessibilityLabel="刷新情报"
          />
        }
        border
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={refresh.isPending}
            onRefresh={runRefresh}
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
                <Pill label="INTEL" tone="violet" dot />
                <Text style={typography.caption}>{sourceOptions.length} 个来源</Text>
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.heroValue}>{counts.total ?? items.length}</Text>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>篇技术文章</Text>
                  <Text style={styles.metaText}>
                    {sourceOptions.length} 个来源 · {fresh} 篇 24h 新增
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <StatTile label="文章" value={counts.articles ?? items.length} tone="cyan" icon="newspaper-outline" />
                <StatTile label="24h 新增" value={fresh} tone="green" icon="time-outline" />
                <StatTile label="来源" value={sourceOptions.length} tone="violet" icon="globe-outline" />
              </View>
              <Text style={styles.heroHint}>
                BFF 每 {formatMinutes(intelQuery.data?.refresh_minutes)}自动更新；全量拉取技术社区公开文章，不做关键词过滤；使用条件请求、来源冷却和限速，避免反爬。
              </Text>
            </View>

            {notice ? (
              <View style={styles.notice}>
                <Ionicons name="checkmark-circle-outline" size={14} color={palette.green} />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            {intelQuery.error ? (
              <ErrorState
                message={intelQuery.error instanceof Error ? intelQuery.error.message : String(intelQuery.error)}
                onRetry={() => void intelQuery.refetch()}
              />
            ) : null}

            {sourceOptions.length > 1 ? (
              <Segmented<string>
                value={source}
                onChange={setSource}
                scrollable
                options={[
                  { key: "all", label: "全部来源" },
                  ...sourceOptions.map((entry) => ({ key: entry.key, label: entry.label })),
                ]}
              />
            ) : null}

            <SearchField value={search} onChangeText={setSearch} placeholder="搜索标题、作者或来源" />

            <View style={styles.sectionRow}>
              <Text style={typography.label}>情报流</Text>
              <Text style={typography.caption}>
                {filtered.length} 条 · 更新于 {relativeTime(intelQuery.data?.updated_at) || "尚未更新"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <IntelCard
            item={item}
            sourceLabel={sources.find((entry) => entry.key === item.source)?.label}
          />
        )}
        ListEmptyComponent={
          intelQuery.error ? undefined : items.length === 0 ? (
            <EmptyState
              icon="newspaper-outline"
              title="还没有技术文章"
              message="BFF 会定时拉取先知、安全客、Seebug Paper、嘶吼、CN-SEC、腾讯玄武、FreeBuf 等技术社区文章。"
              action={<Button title="立即抓取" icon="sync-outline" onPress={runRefresh} />}
            />
          ) : (
            <EmptyState icon="search-outline" title="没有匹配的情报" message="换一个来源或关键词试试。" />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.md, paddingBottom: 60 },
  headerBlock: { gap: spacing.sm, paddingBottom: spacing.xs },
  hero: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.sm,
    overflow: "hidden",
  },
  heroGlowA: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: palette.violet,
    opacity: 0.12,
    top: -140,
    right: -70,
  },
  heroGlowB: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: palette.cyan,
    opacity: 0.07,
    bottom: -100,
    left: -60,
  },
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroBody: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  heroValue: {
    color: palette.text,
    fontSize: 50,
    lineHeight: 56,
    fontWeight: "800",
    letterSpacing: -2,
  },
  heroText: { flex: 1, paddingBottom: 7, gap: 2 },
  heroTitle: { color: palette.textSecondary, fontSize: 13, fontWeight: "600" },
  metaText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: spacing.xs },
  heroHint: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: tones.green.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: tones.green.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  noticeText: { flex: 1, color: tones.green.fg, fontSize: 12, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xxs,
  },
});
