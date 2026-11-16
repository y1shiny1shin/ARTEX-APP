import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { relativeTime, shortDate } from "../lib/format";
import { palette, radius, spacing, tones, type Tone } from "../theme";
import type { JobSummary } from "../types";
import { Pill } from "./ui";

export function jobSourceLabel(source?: string): string {
  switch (source) {
    case "iguopin":
      return "国聘";
    case "liepin":
      return "猎聘";
    case "jobui":
      return "职友集";
    case "ncss":
      return "国家就业平台";
    case "kanxue":
      return "看雪招聘";
    case "v2ex":
      return "V2EX 酷工作";
    case "remoteok":
      return "RemoteOK";
    default:
      return source || "招聘";
  }
}

export function jobScoreTone(score: number): Tone {
  if (score >= 80) return "green";
  if (score >= 65) return "accent";
  if (score >= 50) return "cyan";
  return "muted";
}

export function jobTagTone(tag: string): Tone {
  switch (tag) {
    case "成都":
      return "accent";
    case "远程":
      return "cyan";
    case "央国企":
      return "violet";
    case "在招":
      return "green";
    case "安全厂商":
      return "amber";
    case "高薪":
      return "green";
    case "校招":
      return "cyan";
    default:
      return "muted";
  }
}

export function JobCard({ job, onPress }: { job: JobSummary; onPress: () => void }) {
  const scoreTone = jobScoreTone(job.score);
  const tags = (job.tags ?? []).slice(0, 5);
  const deadline =
    job.ends_at && new Date(job.ends_at).getTime() > Date.now()
      ? `截止 ${shortDate(job.ends_at)}`
      : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.title} ${job.company}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
    >
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={2}>
            {job.title}
          </Text>
          <Text style={styles.company} numberOfLines={1}>
            {job.company}
          </Text>
        </View>
        <View style={[styles.score, { backgroundColor: tones[scoreTone].bg, borderColor: tones[scoreTone].border }]}>
          <Text style={[styles.scoreValue, { color: tones[scoreTone].fg }]}>{job.score}</Text>
          <Text style={[styles.scoreLabel, { color: tones[scoreTone].fg }]}>匹配</Text>
        </View>
      </View>

      <View style={styles.salaryRow}>
        <Text style={styles.salary}>{job.salary || "薪资未标"}</Text>
        <View style={styles.location}>
          <Ionicons name="location-outline" size={12} color={palette.muted} />
          <Text style={styles.meta} numberOfLines={1}>
            {job.location || "地点未标"}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {job.experience ? <Text style={styles.meta}>{job.experience}</Text> : null}
        {job.education ? <Text style={styles.meta}>{job.education}</Text> : null}
        <Text style={styles.meta}>{relativeTime(job.posted_at ?? job.first_seen)}</Text>
        {deadline ? <Text style={[styles.meta, { color: palette.amber }]}>{deadline}</Text> : null}
      </View>

      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <Pill key={tag} label={tag} tone={jobTagTone(tag)} />
          ))}
        </View>
      ) : null}

      {(job.matched ?? []).length > 0 ? (
        <Text style={styles.matched} numberOfLines={1}>
          关键词：{(job.matched ?? []).slice(0, 4).join("、")}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.source}>
          <Ionicons name="briefcase-outline" size={11} color={palette.muted} />
          <Text style={styles.meta}>{jobSourceLabel(job.source)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={palette.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  titleWrap: { flex: 1, gap: 2 },
  title: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  company: { color: palette.textSecondary, fontSize: 12.5, fontWeight: "600" },
  score: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { fontSize: 18, fontWeight: "800", lineHeight: 21 },
  scoreLabel: { fontSize: 9, fontWeight: "700" },
  salaryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  salary: { color: palette.green, fontSize: 15, fontWeight: "800" },
  location: { flexDirection: "row", alignItems: "center", gap: 3, flex: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  meta: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  matched: { color: palette.textSecondary, fontSize: 11, lineHeight: 16 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  source: { flexDirection: "row", alignItems: "center", gap: 4 },
});
