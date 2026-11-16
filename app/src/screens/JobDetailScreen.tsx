import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  jobScoreTone,
  jobSourceLabel,
  jobTagTone,
} from "../components/JobCard";
import {
  Button,
  Card,
  ErrorState,
  Header,
  IconButton,
  Pill,
  Screen,
  SectionTitle,
  Spinner,
} from "../components/ui";
import { useJob } from "../hooks/queries";
import { relativeTime, shortDate } from "../lib/format";
import { palette, radius, spacing, tones, typography } from "../theme";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function JobDetailScreen({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const jobQuery = useJob(jobId);

  const openOriginal = React.useCallback(() => {
    const url = jobQuery.data?.url;
    if (!url) return;
    Linking.openURL(url).catch((error: unknown) =>
      Alert.alert("无法打开链接", errorText(error)),
    );
  }, [jobQuery.data?.url]);

  if (jobQuery.isLoading && !jobQuery.data) {
    return (
      <Screen>
        <Header title="职位详情" left={<IconButton name="arrow-back" onPress={onBack} variant="plain" />} />
        <Spinner label="加载岗位" />
      </Screen>
    );
  }

  if (jobQuery.error && !jobQuery.data) {
    return (
      <Screen>
        <Header title="职位详情" left={<IconButton name="arrow-back" onPress={onBack} variant="plain" />} />
        <ErrorState message={errorText(jobQuery.error)} onRetry={() => void jobQuery.refetch()} />
      </Screen>
    );
  }

  const job = jobQuery.data;
  if (!job) return null;
  const scoreTone = jobScoreTone(job.score);
  const deadline =
    job.ends_at && new Date(job.ends_at).getTime() > Date.now()
      ? shortDate(job.ends_at)
      : "";

  return (
    <Screen>
      <Header
        title="职位详情"
        subtitle={jobSourceLabel(job.source)}
        left={<IconButton name="arrow-back" onPress={onBack} variant="plain" accessibilityLabel="返回" />}
        right={
          <View style={[styles.score, { backgroundColor: tones[scoreTone].bg, borderColor: tones[scoreTone].border }]}>
            <Text style={[styles.scoreValue, { color: tones[scoreTone].fg }]}>{job.score}</Text>
            <Text style={[styles.scoreLabel, { color: tones[scoreTone].fg }]}>匹配</Text>
          </View>
        }
        border
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.company}>{job.company}</Text>
          <Text style={styles.salary}>{job.salary || "薪资未标"}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={13} color={palette.muted} />
              <Text style={styles.meta}>{job.location || "地点未标"}</Text>
            </View>
            {job.experience ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={13} color={palette.muted} />
                <Text style={styles.meta}>{job.experience}</Text>
              </View>
            ) : null}
            {job.education ? (
              <View style={styles.metaItem}>
                <Ionicons name="school-outline" size={13} color={palette.muted} />
                <Text style={styles.meta}>{job.education}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>发布 {relativeTime(job.posted_at ?? job.first_seen)}</Text>
            {deadline ? <Text style={[styles.meta, { color: palette.amber }]}>截止 {deadline}</Text> : null}
          </View>
          {(job.tags ?? []).length > 0 ? (
            <View style={styles.tags}>
              {(job.tags ?? []).map((tag) => (
                <Pill key={tag} label={tag} tone={jobTagTone(tag)} />
              ))}
            </View>
          ) : null}
          {(job.matched ?? []).length > 0 ? (
            <Text style={styles.matched}>
              匹配关键词：{(job.matched ?? []).join("、")}
            </Text>
          ) : null}
        </View>

        {(job.reasons ?? []).length > 0 ? (
          <>
            <SectionTitle title="匹配原因" />
            <Card style={styles.reasons}>
              {(job.reasons ?? []).map((reason) => (
                <View key={reason} style={styles.reasonRow}>
                  <Ionicons name="checkmark-circle" size={15} color={palette.green} />
                  <Text style={styles.reason}>{reason}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionTitle title="职位描述" />
        <Card style={styles.descriptionCard}>
          <Text style={styles.description} selectable>
            {job.description?.trim() || "该来源未提供完整职位描述，请打开原始页面查看。"}
          </Text>
        </Card>

        <View style={styles.info}>
          <Ionicons name="information-circle-outline" size={15} color={palette.cyan} />
          <Text style={styles.infoText}>
            数据来源：{jobSourceLabel(job.source)}。投递前请以原始页面/HR 信息为准。
          </Text>
        </View>

        <Button
          title="打开原始职位"
          icon="open-outline"
          onPress={openOriginal}
          style={styles.open}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: 60, gap: spacing.xs },
  hero: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: { color: palette.text, fontSize: 21, lineHeight: 28, fontWeight: "800", letterSpacing: -0.3 },
  company: { color: palette.textSecondary, fontSize: 14, fontWeight: "600" },
  salary: { color: palette.green, fontSize: 18, fontWeight: "800", marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  matched: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  score: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { fontSize: 17, fontWeight: "800", lineHeight: 20 },
  scoreLabel: { fontSize: 9, fontWeight: "700" },
  reasons: { gap: spacing.xs },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  reason: { flex: 1, color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  descriptionCard: { paddingVertical: spacing.sm },
  description: { color: palette.textSecondary, fontSize: 13, lineHeight: 21 },
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
  open: { marginTop: spacing.sm },
});
