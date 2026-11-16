import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";

import {
  compactNumber,
  isWithinHours,
  languageColor,
  relativeTime,
  splitRepo,
} from "../lib/format";
import { palette, radius, spacing, tones } from "../theme";
import type { GitHubItem } from "../types";
import { Card, Pill } from "./ui";

export function RepoCard({ item }: { item: GitHubItem }) {
  const { owner, name } = splitRepo(item.full_name);
  const fresh = isWithinHours(item.first_seen, 24);
  const topics = (item.topics ?? []).slice(0, 3);

  const open = React.useCallback(() => {
    if (!item.html_url) return;
    Linking.openURL(item.html_url).catch((error: unknown) => {
      Alert.alert("无法打开链接", error instanceof Error ? error.message : String(error));
    });
  }, [item.html_url]);

  return (
    <Card onPress={open} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <Text style={styles.owner} numberOfLines={1}>
            {owner}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={styles.badges}>
          {fresh ? <Pill label="NEW" tone="green" dot /> : null}
          <Ionicons name="open-outline" size={15} color={palette.muted} />
        </View>
      </View>

      <Text style={styles.description} numberOfLines={3}>
        {item.description?.trim() || "关注者 Star 了该仓库"}
      </Text>

      <View style={styles.footer}>
        {item.language ? (
          <View style={styles.lang}>
            <View style={[styles.langDot, { backgroundColor: languageColor(item.language) }]} />
            <Text style={styles.footerText}>{item.language}</Text>
          </View>
        ) : null}
        {(item.stars ?? 0) > 0 ? (
          <View style={styles.stat}>
            <Ionicons name="star-outline" size={12} color={palette.amber} />
            <Text style={styles.footerText}>{compactNumber(item.stars ?? 0)}</Text>
          </View>
        ) : null}
        {(item.forks ?? 0) > 0 ? (
          <View style={styles.stat}>
            <Ionicons name="git-branch-outline" size={12} color={palette.violet} />
            <Text style={styles.footerText}>{compactNumber(item.forks ?? 0)}</Text>
          </View>
        ) : null}
        <Text style={styles.footerText}>
          {item.actor ? `${item.actor} Star · ` : ""}
          {relativeTime(item.occurred_at ?? item.first_seen)}
        </Text>
      </View>

      {topics.length > 0 ? (
        <View style={styles.topics}>
          {topics.map((topic) => (
            <View key={topic} style={styles.topic}>
              <Text style={styles.topicText}>#{topic}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  titleWrap: { flex: 1 },
  owner: { color: palette.muted, fontSize: 11, fontWeight: "600", lineHeight: 15 },
  name: {
    color: palette.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  badges: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  description: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  lang: { flexDirection: "row", alignItems: "center", gap: 5 },
  langDot: { width: 8, height: 8, borderRadius: 4 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  topics: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  topic: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  topicText: { color: tones.cyan.fg, fontSize: 10, fontWeight: "700" },
});
