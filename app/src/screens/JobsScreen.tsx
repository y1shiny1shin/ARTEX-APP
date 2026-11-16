import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { JobCard, jobSourceLabel } from "../components/JobCard";
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
import { useJobs, useRefreshJobs } from "../hooks/queries";
import { isWithinHours, relativeTime } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";
import type { JobSummary } from "../types";

type JobFilter = "all" | "chengdu" | "remote" | "state_owned";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasTag(job: JobSummary, tag: string): boolean {
  return (job.tags ?? []).includes(tag);
}

function matchesFilter(job: JobSummary, filter: JobFilter): boolean {
  if (filter === "chengdu") {
    return hasTag(job, "成都") || (job.location ?? "").includes("成都");
  }
  if (filter === "remote") return Boolean(job.remote) || hasTag(job, "远程");
  if (filter === "state_owned") return Boolean(job.state_owned) || hasTag(job, "央国企");
  return true;
}

function matchesSearch(job: JobSummary, needle: string): boolean {
  if (!needle) return true;
  return [
    job.title,
    job.company,
    job.location,
    job.salary,
    job.experience,
    job.education,
    ...(job.tags ?? []),
    ...(job.matched ?? []),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function JobsScreen({ onOpenJob }: { onOpenJob: (job: JobSummary) => void }) {
  const jobsQuery = useJobs();
  const refresh = useRefreshJobs();
  const [filter, setFilter] = React.useState<JobFilter>("all");
  const [search, setSearch] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const jobs = jobsQuery.data?.jobs ?? [];
  const counts = jobsQuery.data?.counts ?? {};
  const city = jobsQuery.data?.city ?? "成都";
  const sources = jobsQuery.data?.sources ?? [];
  const fresh = jobs.filter((job) => isWithinHours(job.first_seen, 24)).length;

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return jobs
      .filter((job) => matchesFilter(job, filter))
      .filter((job) => matchesSearch(job, needle));
  }, [filter, jobs, search]);

  const runRefresh = React.useCallback(() => {
    setNotice("");
    refresh.mutate(undefined, {
      onSuccess: (result) => {
        setNotice(
          result.added > 0
            ? `新增 ${result.added} 个匹配岗位，已按岗位去重`
            : "暂无新岗位；招聘站点与匹配条件会在下一轮继续抓取",
        );
      },
      onError: (error) => Alert.alert("刷新失败", errorText(error)),
    });
  }, [refresh]);

  if (jobsQuery.isLoading && !jobsQuery.data) {
    return (
      <Screen>
        <Header title="招聘" subtitle={`${city} · 安全岗位匹配`} large />
        <Spinner label="加载招聘雷达" />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="招聘"
        subtitle={`${city} · 安全岗位匹配`}
        large
        right={
          <IconButton
            name="sync-outline"
            onPress={runRefresh}
            disabled={refresh.isPending}
            accessibilityLabel="刷新岗位"
          />
        }
      />
      <FlatList
        data={filtered}
        keyExtractor={(job) => job.id}
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
                <Pill label="JOB RADAR" tone="green" dot />
                <Text style={[typography.caption, styles.sourceText]} numberOfLines={1}>
                  {sources.map(jobSourceLabel).join(" · ") || "招聘雷达"}
                </Text>
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.heroValue}>{counts.total ?? jobs.length}</Text>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>个匹配岗位</Text>
                  <Text style={styles.metaText}>
                    {counts.chengdu ?? 0} 个成都 · {counts.state_owned ?? 0} 个央国企 ·{" "}
                    {counts.remote ?? 0} 个远程 · {fresh} 个 24h 新增
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <StatTile label="成都" value={counts.chengdu ?? 0} tone="accent" icon="location-outline" />
                <StatTile label="央国企" value={counts.state_owned ?? 0} tone="violet" icon="business-outline" />
                <StatTile label="远程" value={counts.remote ?? 0} tone="cyan" icon="globe-outline" />
              </View>
              <Button
                title={refresh.isPending ? "正在抓取…" : "立即刷新岗位"}
                icon="sync-outline"
                variant="secondary"
                loading={refresh.isPending}
                onPress={runRefresh}
              />
              <Text style={styles.heroHint}>
                匹配画像：成都/远程 · 渗透测试/安全运营/信息安全 · 本科 · 3 年经验 · 央国企优先 ·
                安全厂商降权。数据来自国聘、猎聘、职友集、国家就业平台、看雪招聘、V2EX、RemoteOK。
              </Text>
            </View>

            {notice ? (
              <View style={styles.notice}>
                <Ionicons name="checkmark-circle-outline" size={14} color={palette.green} />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            {jobsQuery.error ? (
              <ErrorState
                message={errorText(jobsQuery.error)}
                onRetry={() => void jobsQuery.refetch()}
              />
            ) : null}

            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="搜索岗位、公司、地点或关键词"
            />

            <Segmented<JobFilter>
              value={filter}
              onChange={setFilter}
              options={[
                { key: "all", label: "全部", count: jobs.length },
                { key: "chengdu", label: "成都", count: counts.chengdu ?? 0 },
                { key: "remote", label: "远程", count: counts.remote ?? 0 },
                { key: "state_owned", label: "央国企", count: counts.state_owned ?? 0 },
              ]}
            />

            <View style={styles.sectionRow}>
              <Text style={typography.label}>岗位</Text>
              <Text style={typography.caption}>
                {filtered.length} 个 · 更新于 {relativeTime(jobsQuery.data?.updated_at) || "尚未更新"}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <JobCard job={item} onPress={() => onOpenJob(item)} />
        )}
        ListEmptyComponent={
          jobsQuery.error ? undefined : jobs.length === 0 ? (
            <EmptyState
              icon="briefcase-outline"
              title="还没有匹配岗位"
              message="BFF 会定时从国聘、看雪招聘、V2EX 和 RemoteOK 抓取岗位，按你的画像匹配并去重。点“立即刷新岗位”可马上抓取。"
              action={<Button title="立即抓取" icon="sync-outline" onPress={runRefresh} />}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="没有匹配的岗位"
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
    backgroundColor: palette.green,
    opacity: 0.1,
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
  heroHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  sourceText: { flex: 1, textAlign: "right" },
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
