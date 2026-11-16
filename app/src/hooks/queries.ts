import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSession } from "../session";
import type {
  ActivityPage,
  AgentInfo,
  Approval,
  ConductorReply,
  Conversation,
  ConversationCreateInput,
  GitHubFeed,
  IntelResponse,
  JobDetail,
  JobsFeed,
  Overview,
  Progress,
  StoredMessage,
  Task,
  TaskCreateInput,
} from "../types";

export const queryKeys = {
  overview: ["overview"] as const,
  progress: (id: string) => ["progress", id] as const,
  progressAll: ["progress"] as const,
  taskConversation: (id: string) => ["task-conversation", id] as const,
  conversations: ["conversations"] as const,
  conversation: (id: number) => ["conversation", id] as const,
  conversationDetail: (id: number, seq: number) => ["conversation-detail", id, seq] as const,
  taskDetail: (id: string, seq: number) => ["task-detail", id, seq] as const,
  approvals: ["approvals"] as const,
  github: ["github"] as const,
  conductorHistory: ["conductor-history"] as const,
  agents: ["agents"] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["job", id] as const,
  intel: (kind: string) => ["intel", kind] as const,
};

export function useOverview() {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: () => request<Overview>("/v1/overview"),
    refetchInterval: 6000,
    staleTime: 3000,
  });
}

export function useTaskProgress(id: string) {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.progress(id),
    queryFn: () => request<Progress>(`/v1/tasks/${encodeURIComponent(id)}/progress`),
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

export function useTaskConversation(id: string, enabled = true) {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.taskConversation(id),
    queryFn: () => request<ActivityPage>(`/v1/tasks/${encodeURIComponent(id)}/conversation`),
    refetchInterval: 5000,
    staleTime: 2000,
    enabled,
  });
}

export function useConversations() {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: () => request<{ conversations: Conversation[] }>("/v1/conversations"),
    refetchInterval: 8000,
    staleTime: 4000,
  });
}

export function useConversation(id: number, enabled = true) {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.conversation(id),
    queryFn: () => request<ActivityPage>(`/v1/conversations/${id}/messages?limit=200`),
    refetchInterval: (query) => (query.state.data?.running ? 2500 : 12000),
    staleTime: 1500,
    enabled,
  });
}

type DetailSource = { type: "conversation"; id: number } | { type: "task"; id: string };

export function useActivityDetail(source: DetailSource, seq: number, enabled: boolean) {
  const { request } = useSession();
  const path =
    source.type === "conversation"
      ? `/v1/conversations/${source.id}/messages/${seq}`
      : `/v1/tasks/${encodeURIComponent(source.id)}/conversation/${seq}`;
  const key =
    source.type === "conversation"
      ? queryKeys.conversationDetail(source.id, seq)
      : queryKeys.taskDetail(source.id, seq);
  return useQuery({
    queryKey: key,
    queryFn: () => request<{ detail?: string }>(path),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useApprovals() {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.approvals,
    queryFn: () => request<{ approvals: Approval[] }>("/v1/approvals"),
    refetchInterval: 5000,
    staleTime: 2000,
  });
}

export function useGitHubFeed() {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.github,
    queryFn: () => request<GitHubFeed>("/v1/github/feed?limit=200"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useAgents() {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => request<{ agents: AgentInfo[] }>("/v1/agents"),
    staleTime: 5 * 60_000,
  });
}

export function useJobs() {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: () => request<JobsFeed>("/v1/jobs?limit=200"),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });
}

export function useJob(id: string) {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.job(id),
    queryFn: () => request<JobDetail>(`/v1/jobs/${encodeURIComponent(id)}`),
    staleTime: 5 * 60_000,
  });
}

export function useRefreshJobs() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ added: number }>("/v1/jobs/refresh", { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

export function useIntel(kind: "all" | "article" | "vuln") {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.intel(kind),
    queryFn: () => request<IntelResponse>(`/v1/intel?kind=${kind}&limit=300`),
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
  });
}

export function useRefreshIntel() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ added: number }>("/v1/intel/refresh", { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["intel"] });
    },
  });
}

export function useConductorHistory(enabled: boolean) {
  const { request } = useSession();
  return useQuery({
    queryKey: queryKeys.conductorHistory,
    queryFn: () => request<{ messages: StoredMessage[] }>("/v1/messages"),
    enabled,
    staleTime: 10_000,
  });
}

export function useDecideApproval() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ approval, allow }: { approval: Approval; allow: boolean }) =>
      request<{ ok: boolean }>(`/v1/approvals/${encodeURIComponent(String(approval.id))}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision: allow ? "allowed" : "denied" }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.approvals });
      void client.invalidateQueries({ queryKey: queryKeys.overview });
      void client.invalidateQueries({ queryKey: queryKeys.progressAll });
    },
  });
}

export function useControlTask(taskID: string) {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: "pause" | "resume") =>
      request<{ ok: boolean }>(`/v1/tasks/${encodeURIComponent(taskID)}/control`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.progress(taskID) });
      void client.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useSendDirective(taskID: string) {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      request<{ ok: boolean }>(`/v1/tasks/${encodeURIComponent(taskID)}/directive`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.taskConversation(taskID) });
      void client.invalidateQueries({ queryKey: queryKeys.progress(taskID) });
    },
  });
}

export function useSendConversation(id: number) {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      request<{ ok: boolean }>(`/v1/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.conversation(id) });
      void client.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useRefreshGitHub() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ added: number }>("/v1/github/refresh", { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.github });
    },
  });
}

export function useConductorMessage() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      request<ConductorReply>("/v1/conductor/messages", {
        method: "POST",
        body: JSON.stringify({ message }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.overview });
      void client.invalidateQueries({ queryKey: queryKeys.approvals });
      void client.invalidateQueries({ queryKey: queryKeys.progressAll });
    },
  });
}

export function useResolveConfirmation() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      request<{ ok: boolean; state?: string }>(`/v1/confirmations/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.overview });
      void client.invalidateQueries({ queryKey: queryKeys.approvals });
      void client.invalidateQueries({ queryKey: queryKeys.progressAll });
    },
  });
}

export function useCreateTask() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreateInput) =>
      request<{ task: Task }>("/v1/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

export function useCreateConversation() {
  const { request } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ConversationCreateInput) =>
      request<{ conversation: Conversation }>("/v1/conversations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}
