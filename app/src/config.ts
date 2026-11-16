declare const process: { env: Record<string, string | undefined> };

export const DEFAULT_BASE = process.env.EXPO_PUBLIC_BFF_URL ?? "http://127.0.0.1:8788";

export const STORAGE_KEYS = {
  base: "ryagent_base",
  token: "ryagent_token",
  device: "ryagent_device",
} as const;
