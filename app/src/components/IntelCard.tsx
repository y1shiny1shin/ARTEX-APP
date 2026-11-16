import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { relativeTime } from "../lib/format";
import { palette, radius, spacing, tones, type Tone } from "../theme";
import type { IntelItem } from "../types";
import { Pill } from "./ui";

export function intelSourceLabel(key?: string, fallback?: string): string {
  if (fallback) return fallback;
  switch (key) {
    case "freebuf":
      return "FreeBuf";
    case "xz":
      return "先知社区";
    case "thn":
      return "The Hacker News";
    case "bleepingcomputer":
      return "BleepingComputer";
    case "krebs":
      return "Krebs on Security";
    case "securityweek":
      return "SecurityWeek";
    case "exploitdb":
      return "Exploit-DB";
    case "cisa-kev":
      return "CISA KEV";
    case "seebug":
      return "Seebug Paper";
    case "4hou":
      return "嘶吼";
    case "cnsec":
      return "CN-SEC";
    case "xlab":
      return "腾讯玄武实验室";
    case "anquanke":
      return "安全客";
    default:
      return key || "安全情报";
  }
}

export function severityTone(severity?: string): Tone {
  switch ((severity || "").toLowerCase()) {
    case "critical":
    case "high":
    case "kev":
      return "red";
    case "medium":
      return "amber";
    case "low":
      return "cyan";
    default:
      return "muted";
  }
}

function openURL(url: string) {
  if (!url) return;
  Linking.openURL(url).catch((error: unknown) =>
    Alert.alert("无法打开链接", error instanceof Error ? error.message : String(error)),
  );
}

export function IntelCard({ item, sourceLabel }: { item: IntelItem; sourceLabel?: string }) {
  const isVuln = item.kind === "vuln";
  const tone = severityTone(item.severity);
  const published = relativeTime(item.published_at ?? item.first_seen);
  const source = intelSourceLabel(item.source, sourceLabel);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openURL(item.url)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
    >
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Pill label={source} tone={isVuln ? "violet" : "cyan"} />
          {isVuln && item.severity ? (
            <Pill label={item.severity.toUpperCase()} tone={tone} />
          ) : null}
          {item.exploited ? <Pill label="已利用" tone="red" dot /> : null}
        </View>
        <Ionicons name="open-outline" size={14} color={palette.muted} />
      </View>

      {isVuln && (item.cve || item.id) ? (
        <Text style={styles.ident} numberOfLines={1}>
          {item.cve || item.id}
          {item.cvss ? ` · CVSS ${item.cvss.toFixed(1)}` : ""}
        </Text>
      ) : null}

      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>

      {isVuln && (item.vendor || item.product) ? (
        <Text style={styles.vendor} numberOfLines={1}>
          {[item.vendor, item.product].filter(Boolean).join(" · ")}
        </Text>
      ) : null}

      {item.summary ? (
        <Text style={styles.summary} numberOfLines={3}>
          {item.summary}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.meta}>{published || "刚刚"}</Text>
        <Text style={styles.meta}>{item.tags?.slice(0, 2).join(" · ") || ""}</Text>
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
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1 },
  ident: { color: tones.red.fg, fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  title: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.15,
  },
  vendor: { color: palette.textSecondary, fontSize: 11, fontWeight: "600" },
  summary: { color: palette.textSecondary, fontSize: 12.5, lineHeight: 18 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  meta: { color: palette.muted, fontSize: 10, fontWeight: "600" },
});
