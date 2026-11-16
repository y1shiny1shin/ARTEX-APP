import { Platform, StyleSheet } from "react-native";

/**
 * Single source of truth for the visual language. Screens only consume tokens
 * from here, so a future theme (light mode, accent swap) is one file away.
 */
export const palette = {
  bg: "#06080E",
  bgElevated: "#0A0E16",
  surface: "#10161F",
  surfaceAlt: "#161E2A",
  surfaceRaised: "#1B2432",
  border: "rgba(148, 163, 184, 0.12)",
  borderStrong: "rgba(148, 163, 184, 0.22)",
  text: "#F2F6FC",
  textSecondary: "#AEB9CB",
  muted: "#748096",
  accent: "#7C8CFF",
  accentDeep: "#5A6BFF",
  cyan: "#3ED8E8",
  green: "#3DDC97",
  amber: "#F6BE5A",
  red: "#FF7088",
  violet: "#B79CFF",
  pink: "#FF93C8",
  onAccent: "#080C18",
  overlay: "rgba(3, 5, 10, 0.72)",
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 34,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const typography = StyleSheet.create({
  display: {
    color: palette.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  title: {
    color: palette.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  heading: {
    color: palette.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  body: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
  },
  bodySecondary: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  caption: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  mono: {
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
});

export const elevation = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  floating: {
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
} as const;

export type Tone = "accent" | "green" | "amber" | "red" | "violet" | "cyan" | "muted";

export const tones: Record<Tone, { fg: string; bg: string; border: string }> = {
  accent: { fg: palette.accent, bg: "rgba(124, 140, 255, 0.14)", border: "rgba(124, 140, 255, 0.32)" },
  green: { fg: palette.green, bg: "rgba(61, 220, 151, 0.13)", border: "rgba(61, 220, 151, 0.3)" },
  amber: { fg: palette.amber, bg: "rgba(246, 190, 90, 0.13)", border: "rgba(246, 190, 90, 0.3)" },
  red: { fg: palette.red, bg: "rgba(255, 112, 136, 0.13)", border: "rgba(255, 112, 136, 0.3)" },
  violet: { fg: palette.violet, bg: "rgba(183, 156, 255, 0.14)", border: "rgba(183, 156, 255, 0.3)" },
  cyan: { fg: palette.cyan, bg: "rgba(62, 216, 232, 0.12)", border: "rgba(62, 216, 232, 0.28)" },
  muted: { fg: palette.textSecondary, bg: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.2)" },
};
