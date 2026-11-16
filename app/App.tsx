import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ApiError } from "./src/api";
import { MainNavigator } from "./src/MainNavigator";
import { PairScreen } from "./src/screens/PairScreen";
import { SessionProvider, useSession } from "./src/session";
import { palette, spacing, typography } from "./src/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function BootSplash() {
  return (
    <View style={styles.boot}>
      <View style={styles.logo}>
        <Ionicons name="shield-checkmark" size={30} color={palette.accent} />
      </View>
      <Text style={typography.title}>RyAgent</Text>
      <Text style={typography.caption}>正在恢复本地会话</Text>
      <ActivityIndicator color={palette.accent} style={styles.spinner} />
    </View>
  );
}

function Root() {
  const { ready, token } = useSession();
  if (!ready) return <BootSplash />;
  if (!token) return <PairScreen />;
  return <MainNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    backgroundColor: palette.bg,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    marginBottom: spacing.sm,
  },
  spinner: { marginTop: spacing.md },
});
