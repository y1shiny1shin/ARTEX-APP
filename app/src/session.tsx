import * as SecureStore from "expo-secure-store";
import React from "react";

import { ApiError, requestRaw } from "./api";
import { DEFAULT_BASE, STORAGE_KEYS } from "./config";
import type { PairResult } from "./types";

export type RequestFn = <T>(path: string, init?: RequestInit) => Promise<T>;

type SessionValue = {
  base: string;
  token: string | null;
  deviceName: string | null;
  ready: boolean;
  pair: (password: string, deviceName: string, baseOverride?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  changeServer: (base: string) => Promise<void>;
  request: RequestFn;
};

const SessionContext = React.createContext<SessionValue | null>(null);

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // SecureStore can be unavailable in previews/emulators; the session still
    // works for this process, it just will not survive a restart.
  }
}

async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignored
  }
}

function normalizeBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_BASE;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [base, setBaseState] = React.useState(DEFAULT_BASE);
  const [token, setToken] = React.useState<string | null>(null);
  const [deviceName, setDeviceName] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const [savedBase, savedToken, savedDevice] = await Promise.all([
        readSecure(STORAGE_KEYS.base),
        readSecure(STORAGE_KEYS.token),
        readSecure(STORAGE_KEYS.device),
      ]);
      if (!active) return;
      if (savedBase) setBaseState(normalizeBase(savedBase));
      if (savedToken) setToken(savedToken);
      if (savedDevice) setDeviceName(savedDevice);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const clearToken = React.useCallback(async () => {
    setToken(null);
    await deleteSecure(STORAGE_KEYS.token);
  }, []);

  const pair = React.useCallback(
    async (password: string, name: string, baseOverride?: string) => {
      const target = normalizeBase(baseOverride ?? base);
      const result = await requestRaw<PairResult>(target, null, "/v1/auth/pair", {
        method: "POST",
        body: JSON.stringify({ password, device_name: name }),
      });
      await Promise.all([
        writeSecure(STORAGE_KEYS.base, target),
        writeSecure(STORAGE_KEYS.token, result.token),
        writeSecure(STORAGE_KEYS.device, name),
      ]);
      setBaseState(target);
      setToken(result.token);
      setDeviceName(name);
    },
    [base],
  );

  const disconnect = React.useCallback(async () => {
    await clearToken();
  }, [clearToken]);

  const changeServer = React.useCallback(
    async (next: string) => {
      const target = normalizeBase(next);
      await writeSecure(STORAGE_KEYS.base, target);
      setBaseState(target);
      await clearToken();
    },
    [clearToken],
  );

  const request = React.useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      try {
        return await requestRaw<T>(base, token, path, init);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && token) {
          await clearToken();
        }
        throw error;
      }
    },
    [base, token, clearToken],
  );

  const value = React.useMemo<SessionValue>(
    () => ({ base, token, deviceName, ready, pair, disconnect, changeServer, request }),
    [base, token, deviceName, ready, pair, disconnect, changeServer, request],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
