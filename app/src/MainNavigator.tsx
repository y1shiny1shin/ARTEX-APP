import React from "react";
import { BackHandler, StyleSheet, View } from "react-native";

import { TabBar } from "./components/TabBar";
import { useGitHubFeed, useJobs, useOverview } from "./hooks/queries";
import { isWithinHours } from "./lib/format";
import { NavigationProvider, type Route, type TabKey } from "./navigation";
import { ApprovalsScreen } from "./screens/ApprovalsScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { ChatsScreen } from "./screens/ChatsScreen";
import { ConductorScreen } from "./screens/ConductorScreen";
import { CreateConversationScreen } from "./screens/CreateConversationScreen";
import { CreateTaskScreen } from "./screens/CreateTaskScreen";
import { DiscoverScreen } from "./screens/DiscoverScreen";
import { IntelScreen } from "./screens/IntelScreen";
import { JobDetailScreen } from "./screens/JobDetailScreen";
import { JobsScreen } from "./screens/JobsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TaskDetailScreen } from "./screens/TaskDetailScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { palette } from "./theme";
import type { Conversation, JobSummary, Task } from "./types";

export function MainNavigator() {
  const [tab, setTab] = React.useState<TabKey>("tasks");
  const [route, setRoute] = React.useState<Route>({ name: "tabs" });
  const overview = useOverview();
  const feed = useGitHubFeed();
  const jobsQuery = useJobs();

  const approvals = overview.data?.counts?.approvals ?? overview.data?.approvals?.length ?? 0;
  const fresh = React.useMemo(
    () => (feed.data?.items ?? []).filter((item) => isWithinHours(item.first_seen, 24)).length,
    [feed.data],
  );
  const jobNew = React.useMemo(
    () => (jobsQuery.data?.jobs ?? []).filter((job) => isWithinHours(job.first_seen, 24)).length,
    [jobsQuery.data],
  );

  const navigation = React.useMemo(
    () => ({
      push: (next: Exclude<Route, { name: "tabs" }>) => setRoute(next),
      pop: () => setRoute({ name: "tabs" }),
    }),
    [],
  );

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route.name !== "tabs") {
        setRoute({ name: "tabs" });
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [route.name]);

  const openTask = React.useCallback((task: Task) => {
    setRoute({ name: "task", id: String(task.id), title: task.name ?? task.description });
  }, []);

  const openApprovals = React.useCallback(() => setRoute({ name: "approvals" }), []);
  const openConductor = React.useCallback(() => setRoute({ name: "conductor" }), []);
  const openJob = React.useCallback((job: JobSummary) => {
    setRoute({ name: "job", id: job.id });
  }, []);

  const handleTaskCreated = React.useCallback((task: Task) => {
    const id = String(task?.id ?? "").trim();
    if (!id) {
      setRoute({ name: "tabs" });
      setTab("tasks");
      return;
    }
    setRoute({ name: "task", id, title: task.name ?? task.description });
  }, []);

  const handleConversationCreated = React.useCallback((conversation: Conversation) => {
    setRoute({
      name: "chat",
      id: conversation.id,
      title: conversation.title || "新对话",
    });
  }, []);

  if (route.name === "task-new") {
    return <CreateTaskScreen onBack={navigation.pop} onCreated={handleTaskCreated} />;
  }

  if (route.name === "chat-new") {
    return (
      <CreateConversationScreen
        onBack={navigation.pop}
        onCreated={handleConversationCreated}
      />
    );
  }

  if (route.name === "task") {
    return (
      <TaskDetailScreen
        taskId={route.id}
        initialTask={overview.data?.tasks.find((task) => String(task.id) === route.id)}
        onBack={navigation.pop}
      />
    );
  }

  if (route.name === "chat") {
    return (
      <ChatScreen conversationId={route.id} initialTitle={route.title} onBack={navigation.pop} />
    );
  }

  if (route.name === "job") {
    return <JobDetailScreen jobId={route.id} onBack={navigation.pop} />;
  }

  if (route.name === "intel") {
    return <IntelScreen onBack={navigation.pop} />;
  }

  if (route.name === "approvals") {
    return <ApprovalsScreen onBack={navigation.pop} />;
  }

  if (route.name === "conductor") {
    return <ConductorScreen onBack={navigation.pop} />;
  }

  return (
    <NavigationProvider value={navigation}>
      <View style={styles.root}>
        <View style={styles.content}>
          {tab === "tasks" ? (
            <TasksScreen
              onOpenTask={openTask}
              onOpenApprovals={openApprovals}
              onOpenConductor={openConductor}
              onCreateTask={() => navigation.push({ name: "task-new" })}
            />
          ) : null}
          {tab === "chats" ? (
            <ChatsScreen
              onOpenConversation={(conversation) =>
                navigation.push({ name: "chat", id: conversation.id, title: conversation.title })
              }
              onCreateConversation={() => navigation.push({ name: "chat-new" })}
            />
          ) : null}
          {tab === "discover" ? <DiscoverScreen /> : null}
          {tab === "jobs" ? <JobsScreen onOpenJob={openJob} /> : null}
          {tab === "settings" ? <SettingsScreen /> : null}
        </View>
        <TabBar
          tab={tab}
          onChange={setTab}
          approvals={approvals}
          discoverNew={fresh}
          jobNew={jobNew}
        />
      </View>
    </NavigationProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { flex: 1 },
});
