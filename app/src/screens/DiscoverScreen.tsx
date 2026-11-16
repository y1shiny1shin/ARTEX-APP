import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { EventCard } from "../components/EventCard";
import { RepoCard } from "../components/RepoCard";
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
import { useGitHubFeed, useRefreshGitHub } from "../hooks/queries";
import { formatMinutes, isWithinHours } from "../lib/format";
import { useNavigation } from "../navigation";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { GitHubItem } from "../types";

type FeedFilter = "all" | "star" | "event";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matches(item: GitHubItem, needle: string): boolean {
  if (!needle) return true;
  return [
    item.full_name,
    item.description,
    item.actor,
    item.event_summary,
    item.event_type,
    item.language,
    ...(item.topics ?? []),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function DiscoverScreen() {
  const navigation = useNavigation();
  const feedQuery = useGitHubFeed();
  const refresh = useRefreshGitHub();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FeedFilter>("all");
  const [notice, setNotice] = React.useState("");

  const items = feedQuery.data?.items ?? [];
  const owner = feedQuery.data?.owner ?? "y1shiny1shin";
  const following = feedQuery.data?.following ?? 0;
  const tokenConfigured = feedQuery.data?.token_configured ?? false;
  const fresh = items.filter((item) => isWithinHours(item.first_seen, 24)).length;
  const stars = items.filter((item) => item.kind === "star").length;
  const events = items.length - stars;
  const actors = new Set(items.map((item) => item.actor).filter(Boolean)).size;

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "star" && item.kind !== "star") return false;
      if (filter === "event" && item.kind !== "event") return false;
      return matches(item, needle);
    });
  }, [filter, items, search]);

  const runRefresh = React.useCallback(() => {
    setNotice("");
    refresh.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          result.added > 0
            ? `新增 ${result.added} 条关注动态，已按仓库/事件去重`
            : "暂无新动态；GitHub 免费额度有时间窗口，稍后再试",
        );
      },
      onError: (error) => Alert.alert("刷新失败", errorText(error)),
    });
  }, [refresh]);

  if (feedQuery.isLoading && !feedQuery.data) {
    return (
      <Screen>
        <Header title="安全情报" subtitle="关注的人的 Star 与动态" large />
        <Spinner label="加载关注动态" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="安全情报"
        subtitle="关注动态 · 技术文章"
        large
        right={
          <IconButton
            name="newspaper-outline"
            onPress={() => navigation.push({ name: "intel" })}
            accessibilityLabel="安全资讯与漏洞情报"
          />
        }
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
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
                <Pill label="FOLLOWING" tone="cyan" dot />
                <Text style={typography.caption}>github / {owner}</Text>
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.heroValue}>{items.length}</Text>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>条关注动态</Text>
                  <Text style={styles.metaText}>
                    {following} 位关注 · {actors} 位有更新 · {fresh} 条 24h 新增
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <StatTile label="Star" value={stars} tone="amber" icon="star-outline" />
                <StatTile label="动态" value={events} tone="cyan" icon="pulse-outline" />
                <StatTile label="关注" value={following} tone="violet" icon="people-outline" />
              </View>
              <Button
                title={refresh.isPending ? "正在抓取…" : "立即刷新动态"}
                icon="sync-outline"
                variant="secondary"
                loading={refresh.isPending}
                onPress={runRefresh}
              />
              <Text style={styles.heroHint}>
                {tokenConfigured
                  ? `BFF 每 ${formatMinutes(feedQuery.data?.refresh_minutes)}自动抓取关注者的 Star 与 Release，并为 20 个 Star 补全仓库信息。`
                  : `BFF 每 ${formatMinutes(feedQuery.data?.refresh_minutes)}自动抓取关注者的 Star 与 Release，并为 8 个 Star 补全仓库信息；GitHub 匿名限流 60 次/小时。`}
              </Text>
            </View>

            {notice ? (
              <View style={styles.notice}>
                <Ionicons name="checkmark-circle-outline" size={14} color={palette.green} />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            {feedQuery.error ? (
              <ErrorState message={errorText(feedQuery.error)} onRetry={() => void feedQuery.refetch()} />
            ) : null}

            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="搜索仓库、关注者或动态内容"
            />

            <Segmented<FeedFilter>
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "全部", count: items.length },
                { key: "star", label: "Star", count: stars },
                { key: "event", label: "动态", count: events },
              ]}
            />

            <View style={styles.sectionRow}>
              <Text style={typography.label}>情报流</Text>
              <Text style={typography.caption}>{filtered.length} 条</Text>
            </View>
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "star" ? <RepoCard item={item} /> : <EventCard item={item} />
        }
        ListEmptyComponent={
          feedQuery.error ? undefined : items.length === 0 ? (
            <EmptyState
              icon="radio-outline"
              title="还没有关注动态"
              message="BFF 会抓取你关注的人最近的公开 Star 与活动。点“立即刷新动态”可马上抓取。"
              action={<Button title="立即抓取" icon="sync-outline" onPress={runRefresh} />}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="没有匹配的动态"
              message="换一个筛选条件或关键词试试。"
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.md, paddingBottom: 140 },
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
    backgroundColor: palette.cyan,
    opacity: 0.12,
    top: -140,
    right: -70,
  },
  heroGlowB: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: palette.violet,
    opacity: 0.08,
    bottom: -100,
    left: -60,
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
  heroText: { flex: 1, paddingBottom: 8, gap: 2 },
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
