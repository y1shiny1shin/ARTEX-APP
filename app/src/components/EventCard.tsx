import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";

import { eventLabel, relativeTime, splitRepo } from "../lib/format";
import { palette, spacing, tones, type Tone } from "../theme";
import type { GitHubItem } from "../types";
import { Avatar, Card, Pill, type IconName } from "./ui";

type EventLook = { icon: IconName; tone: Tone };

function eventLook(type?: string): EventLook {
  switch (type) {
    case "PushEvent":
      return { icon: "git-commit-outline", tone: "cyan" };
    case "ForkEvent":
      return { icon: "git-branch-outline", tone: "violet" };
    case "CreateEvent":
      return { icon: "add-circle-outline", tone: "green" };
    case "ReleaseEvent":
      return { icon: "rocket-outline", tone: "accent" };
    case "PullRequestEvent":
      return { icon: "git-pull-request-outline", tone: "green" };
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent":
      return { icon: "eye-outline", tone: "accent" };
    case "IssuesEvent":
      return { icon: "alert-circle-outline", tone: "amber" };
    case "IssueCommentEvent":
    case "CommitCommentEvent":
      return { icon: "chatbubble-ellipses-outline", tone: "cyan" };
    case "PublicEvent":
      return { icon: "globe-outline", tone: "cyan" };
    case "DeleteEvent":
      return { icon: "trash-outline", tone: "red" };
    case "MemberEvent":
      return { icon: "people-outline", tone: "violet" };
    case "GollumEvent":
      return { icon: "book-outline", tone: "muted" };
    default:
      return { icon: "pulse-outline", tone: "muted" };
  }
}

export function EventCard({ item }: { item: GitHubItem }) {
  const look = eventLook(item.event_type);
  const { owner, name } = splitRepo(item.full_name);
  const open = React.useCallback(() => {
    if (!item.html_url) return;
    Linking.openURL(item.html_url).catch((error: unknown) => {
      Alert.alert("无法打开链接", error instanceof Error ? error.message : String(error));
    });
  }, [item.html_url]);

  return (
    <Card onPress={open} style={styles.card}>
      <View style={styles.head}>
        <Avatar seed={item.actor ?? "github"} label={item.actor ?? "?"} size={32} icon="person-outline" />
        <View style={styles.actorWrap}>
          <Text style={styles.actor} numberOfLines={1}>
            {item.actor || "关注的人"}
          </Text>
          <Text style={styles.meta}>{relativeTime(item.occurred_at ?? item.first_seen)}</Text>
        </View>
        <View style={[styles.typeIcon, { backgroundColor: tones[look.tone].bg }]}>
          <Ionicons name={look.icon} size={14} color={tones[look.tone].fg} />
        </View>
        <Pill label={eventLabel(item.event_type)} tone={look.tone} />
        <Ionicons name="open-outline" size={14} color={palette.muted} />
      </View>

      <View style={styles.repoRow}>
        <Text style={styles.owner} numberOfLines={1}>
          {owner}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>

      <Text style={styles.summary} numberOfLines={3}>
        {item.event_summary || item.event_type || "公开动态"}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actorWrap: { flex: 1, gap: 1 },
  actor: { color: palette.text, fontSize: 13, fontWeight: "700" },
  meta: { color: palette.muted, fontSize: 10, fontWeight: "600" },
  typeIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  repoRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 2 },
  owner: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  name: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  summary: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
});
