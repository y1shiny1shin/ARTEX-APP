import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { avatarColor, initials } from "../lib/format";
import { elevation, palette, radius, spacing, tones, typography, type Tone } from "../theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Screen({
  children,
  style,
  padded = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top },
        padded && { paddingHorizontal: spacing.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Header({
  title,
  subtitle,
  left,
  right,
  large = false,
  border = false,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  large?: boolean;
  border?: boolean;
}) {
  return (
    <View style={[styles.header, border && styles.headerBorder]}>
      {left ? <View style={styles.headerLeft}>{left}</View> : null}
      <View style={styles.headerCenter}>
        <Text
          style={[large ? typography.display : typography.title, styles.headerTitle]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[typography.caption, styles.headerSubtitle, styles.headerTitle]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  tone = "accent",
  size = 40,
  variant = "surface",
  badge = false,
  disabled = false,
  accessibilityLabel,
}: {
  name: IconName;
  onPress: () => void;
  tone?: Tone;
  size?: number;
  variant?: "surface" | "plain" | "solid";
  badge?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const color = tones[tone].fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? String(name)}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        variant === "surface" && styles.iconSurface,
        variant === "solid" && { backgroundColor: tones[tone].bg, borderColor: tones[tone].border },
        variant === "plain" && { backgroundColor: "transparent", borderColor: "transparent" },
        pressed && { opacity: 0.65 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Ionicons name={name} size={size * 0.48} color={color} />
      {badge ? <View style={[styles.iconBadge, { backgroundColor: palette.red }]} /> : null}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  size = "md",
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const textColor = isPrimary ? palette.onAccent : isDanger ? tones.red.fg : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "sm" && styles.buttonSmall,
        isPrimary && { backgroundColor: palette.accent, borderColor: palette.accent },
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        isDanger && { backgroundColor: tones.red.bg, borderColor: tones.red.border },
        pressed && { opacity: 0.78 },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 15 : 17} color={textColor} /> : null}
          <Text
            style={[
              styles.buttonText,
              size === "sm" && styles.buttonTextSmall,
              { color: textColor },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
  tone,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: Tone;
  padded?: boolean;
}) {
  const content = (
    <View
      style={[
        styles.card,
        padded && styles.cardPadding,
        tone ? { borderColor: tones[tone].border } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.82, transform: [{ scale: 0.995 }] }]}
    >
      {content}
    </Pressable>
  );
}

export function Pill({
  label,
  tone = "muted",
  icon,
  dot = false,
  style,
}: {
  label: string;
  tone?: Tone;
  icon?: IconName;
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, style]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: t.fg }]} /> : null}
      {icon ? <Ionicons name={icon} size={11} color={t.fg} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  tone = "accent",
  icon,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  icon: IconName;
}) {
  const t = tones[tone];
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={15} color={t.fg} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ProgressBar({
  value,
  tone = "accent",
  height = 6,
}: {
  value: number;
  tone?: Tone;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${pct * 100}%`, backgroundColor: tones[tone].fg, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

export type SegmentedOption<T extends string> = { key: T; label: string; count?: number };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  scrollable = false,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (key: T) => void;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const items = options.map((option) => {
    const active = option.key === value;
    return (
      <Pressable
        key={option.key}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => onChange(option.key)}
        style={({ pressed }) => [
          styles.segment,
          scrollable && styles.segmentAuto,
          active && styles.segmentActive,
          pressed && { opacity: 0.75 },
        ]}
      >
        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
        {option.count !== undefined && option.count > 0 ? (
          <View style={[styles.segmentCount, active && styles.segmentCountActive]}>
            <Text style={[styles.segmentCountText, active && { color: palette.onAccent }]}>
              {option.count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.segmentRow, style]}
      >
        {items}
      </ScrollView>
    );
  }
  return <View style={[styles.segmentRow, styles.segmentRowFill, style]}>{items}</View>;
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.searchBox}>
      <Ionicons name="search-outline" size={16} color={palette.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10}>
          <Ionicons name="close-circle" size={16} color={palette.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function FormField({
  label,
  hint,
  multiline = false,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; hint?: string }) {
  return (
    <View style={styles.formField}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        placeholderTextColor={palette.muted}
        style={[styles.formInput, multiline && styles.formInputMultiline, style]}
      />
      {hint ? <Text style={typography.caption}>{hint}</Text> : null}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 50,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="减少"
        onPress={() => onChange(Math.max(min, value - 1))}
        style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="remove" size={18} color={palette.text} />
      </Pressable>
      <Text style={styles.stepperValue}>
        {value}
        {suffix ? <Text style={styles.stepperSuffix}> {suffix}</Text> : null}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="增加"
        onPress={() => onChange(Math.min(max, value + 1))}
        style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="add" size={18} color={palette.text} />
      </Pressable>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  style,
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={palette.accent} />
      </View>
      <Text style={[typography.heading, styles.emptyTitle]}>{title}</Text>
      {message ? <Text style={[typography.caption, styles.emptyMessage]}>{message}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle-outline" size={20} color={palette.red} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button title="重试" variant="secondary" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={styles.spinner}>
      <ActivityIndicator color={palette.accent} />
      {label ? <Text style={typography.caption}>{label}</Text> : null}
    </View>
  );
}

export function Avatar({
  seed,
  label,
  size = 40,
  icon,
}: {
  seed: string;
  label?: string;
  size?: number;
  icon?: IconName;
}) {
  const color = avatarColor(seed);
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}24`,
          borderColor: `${color}55`,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={size * 0.42} color={color} />
      ) : (
        <Text style={[styles.avatarText, { color, fontSize: size * 0.34 }]}>
          {initials(label ?? seed)}
        </Text>
      )}
    </View>
  );
}

export function Composer({
  value,
  onChangeText,
  onSend,
  placeholder,
  sending = false,
  disabled = false,
  hint,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  sending?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const canSend = value.trim().length > 0 && !sending && !disabled;
  return (
    <View style={styles.composerWrap}>
      {hint ? <Text style={[typography.caption, styles.composerHint]}>{hint}</Text> : null}
      <View style={styles.composer}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.muted}
          style={styles.composerInput}
          multiline
          maxLength={4000}
          editable={!sending}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="发送"
          onPress={onSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            pressed && canSend && { opacity: 0.8 },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={palette.onAccent} />
          ) : (
            <Ionicons name="arrow-up" size={19} color={canSend ? palette.onAccent : palette.muted} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={typography.label}>{title}</Text>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  headerLeft: { alignItems: "flex-start" },
  headerCenter: { flex: 1, justifyContent: "center", alignItems: "flex-start" },
  headerTitle: { width: "100%", textAlign: "left" },
  headerSubtitle: { marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconSurface: { backgroundColor: palette.surface },
  iconBadge: {
    position: "absolute",
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonSecondary: { backgroundColor: palette.surfaceAlt },
  buttonGhost: { backgroundColor: "transparent" },
  buttonText: { fontSize: 15, fontWeight: "700", letterSpacing: 0.1 },
  buttonTextSmall: { fontSize: 13 },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    ...elevation.card,
  },
  cardPadding: { padding: spacing.md },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  statTile: {
    flex: 1,
    minWidth: 74,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.sm,
    gap: 5,
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { color: palette.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  statLabel: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  progressTrack: { width: "100%", backgroundColor: palette.surfaceRaised, overflow: "hidden" },
  progressFill: { height: "100%" },
  segmentRow: { flexDirection: "row", gap: spacing.xs },
  segmentRowFill: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  segmentAuto: { flex: 0, paddingHorizontal: spacing.md },
  segmentActive: { backgroundColor: palette.accent },
  segmentText: { color: palette.textSecondary, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: palette.onAccent },
  segmentCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceRaised,
    alignItems: "center",
  },
  segmentCountActive: { backgroundColor: "rgba(8, 12, 24, 0.2)" },
  segmentCountText: { color: palette.textSecondary, fontSize: 10, fontWeight: "800" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchInput: { flex: 1, color: palette.text, fontSize: 14, paddingVertical: 10 },
  formField: { gap: 6 },
  formInput: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    color: palette.text,
    fontSize: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 11,
    minHeight: 46,
  },
  formInputMultiline: { minHeight: 104, paddingTop: 11, lineHeight: 21 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: 4,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceRaised,
  },
  stepperValue: { color: palette.text, fontSize: 16, fontWeight: "800", minWidth: 34, textAlign: "center" },
  stepperSuffix: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: tones.accent.bg,
    borderWidth: 1,
    borderColor: tones.accent.border,
    marginBottom: spacing.sm,
  },
  emptyTitle: { textAlign: "center" },
  emptyMessage: { textAlign: "center", maxWidth: 280 },
  emptyAction: { marginTop: spacing.sm },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: tones.red.bg,
    borderWidth: 1,
    borderColor: tones.red.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  errorText: { flex: 1, color: tones.red.fg, fontSize: 12, lineHeight: 17 },
  spinner: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  avatarText: { fontWeight: "800", letterSpacing: 0.3 },
  composerWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: palette.bgElevated,
  },
  composerHint: { marginBottom: spacing.xxs },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    color: palette.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
    paddingTop: 11,
    paddingBottom: 11,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: palette.surfaceRaised },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: spacing.sm },
});
