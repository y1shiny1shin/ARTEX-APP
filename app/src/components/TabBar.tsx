import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { TabKey } from "../navigation";
import { elevation, palette, radius, spacing, tones, typography } from "../theme";
import type { IconName } from "./ui";

const TABS: { key: TabKey; label: string; icon: IconName; activeIcon: IconName }[] = [
  { key: "tasks", label: "任务", icon: "grid-outline", activeIcon: "grid" },
  { key: "chats", label: "对话", icon: "chatbubbles-outline", activeIcon: "chatbubbles" },
  { key: "discover", label: "情报", icon: "radio-outline", activeIcon: "radio" },
  { key: "jobs", label: "招聘", icon: "briefcase-outline", activeIcon: "briefcase" },
  { key: "settings", label: "设置", icon: "person-circle-outline", activeIcon: "person-circle" },
];

export function TabBar({
  tab,
  onChange,
  approvals,
  discoverNew,
  jobNew,
}: {
  tab: TabKey;
  onChange: (tab: TabKey) => void;
  approvals: number;
  discoverNew: number;
  jobNew: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
    >
      <View style={styles.bar}>
        {TABS.map((item) => {
          const active = item.key === tab;
          const badge = item.key === "tasks" ? approvals : 0;
          const dot =
            (item.key === "discover" && discoverNew > 0) ||
            (item.key === "jobs" && jobNew > 0);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              onPress={() => onChange(item.key)}
              style={({ pressed }) => [
                styles.item,
                active && styles.itemActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View>
                <Ionicons
                  name={active ? item.activeIcon : item.icon}
                  size={21}
                  color={active ? palette.accent : palette.muted}
                />
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
                  </View>
                ) : null}
                {dot ? <View style={styles.dot} /> : null}
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: palette.bgElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    padding: 5,
    gap: 2,
    ...elevation.floating,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: radius.lg,
  },
  itemActive: {
    backgroundColor: tones.accent.bg,
    borderWidth: 1,
    borderColor: tones.accent.border,
  },
  label: { ...typography.caption, fontSize: 10, fontWeight: "700", color: palette.muted },
  labelActive: { color: palette.accent },
  badge: {
    position: "absolute",
    top: -5,
    right: -12,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: palette.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: palette.bgElevated,
  },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  dot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.cyan,
    borderWidth: 1.5,
    borderColor: palette.bgElevated,
  },
});
