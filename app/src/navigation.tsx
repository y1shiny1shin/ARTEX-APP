import React from "react";

export type TabKey = "tasks" | "chats" | "discover" | "jobs" | "settings";

export type DetailRoute =
  | { name: "task"; id: string; title?: string }
  | { name: "task-new" }
  | { name: "chat"; id: number; title?: string }
  | { name: "chat-new" }
  | { name: "job"; id: string }
  | { name: "intel" }
  | { name: "approvals" }
  | { name: "conductor" };

export type Route = { name: "tabs" } | DetailRoute;

type NavigationValue = {
  push: (route: DetailRoute) => void;
  pop: () => void;
};

const NavigationContext = React.createContext<NavigationValue | null>(null);

export function NavigationProvider({
  value,
  children,
}: {
  value: NavigationValue;
  children: React.ReactNode;
}) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = React.useContext(NavigationContext);
  if (!value) throw new Error("useNavigation must be used inside NavigationProvider");
  return value;
}
