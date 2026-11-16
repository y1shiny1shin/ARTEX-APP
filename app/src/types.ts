export type Findings = {
  total?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
};

export type Task = {
  id: string;
  name?: string;
  description?: string;
  goal?: string;
  status?: string;
  paused?: boolean;
  goals_total?: number;
  goals_met?: number;
  in_flight?: number;
  hard_requirement?: string;
  distinct_findings?: Findings;
  findings?: Findings;
  created_at?: string;
  updated_at?: string;
};

export type Approval = {
  id: number | string;
  task_id?: string;
  tool_name?: string;
  reason?: string;
  status?: string;
  tool_input?: unknown;
  created_at?: string;
};

export type Intent = {
  id: string;
  state: string;
  summary: string;
};

export type ProgressSummary = {
  task_id?: string;
  status?: string;
  paused?: boolean;
  goals_total?: number;
  goals_met?: number;
  running_intents?: number;
  pending_approvals?: number;
};

export type Progress = {
  task: Task;
  stats?: Record<string, unknown>;
  intents: Intent[];
  approvals: Approval[];
  summary?: ProgressSummary;
};

export type Overview = {
  tasks: Task[];
  approvals: Approval[];
  counts?: { tasks?: number; running?: number; approvals?: number };
};

export type Conversation = {
  id: number;
  agent_key: string;
  title: string;
  hard_requirement?: string;
  pinned?: boolean;
  pinned_at?: string;
  created_at?: string;
  updated_at?: string;
  running?: boolean;
};

export type Activity = {
  seq: number;
  intent_id?: string;
  worker?: string;
  ts?: string;
  kind?: string;
  tool?: string;
  tool_use_id?: string;
  is_error?: boolean;
  summary?: string;
  detail?: string;
  metadata?: unknown;
  source_task_id?: string;
  inherited?: boolean;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

export type ActivityPage = {
  items: Activity[];
  cursor?: number;
  running?: boolean;
  hasMore?: boolean;
};

export type GitHubItem = {
  key: string;
  kind: "star" | "event";
  actor?: string;
  full_name: string;
  description?: string;
  html_url: string;
  language?: string;
  stars?: number;
  forks?: number;
  topics?: string[];
  event_type?: string;
  event_summary?: string;
  occurred_at?: string;
  first_seen?: string;
};

export type GitHubFeed = {
  items: GitHubItem[];
  owner?: string;
  following?: number;
  token_configured?: boolean;
  refresh_minutes?: number;
};

export type AgentInfo = {
  id?: string;
  key: string;
  name: string;
  description?: string;
  role?: string;
  builtin?: boolean;
  enabled?: boolean;
};

export type TaskCreateInput = {
  name?: string;
  description: string;
  goal: string;
  hard_requirement?: string;
  worker_count?: number;
  timeout_seconds?: number;
  seed_first_intent?: boolean;
};

export type ConversationCreateInput = {
  agent_key: string;
  title?: string;
};

export type JobSummary = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  experience: string;
  education: string;
  summary: string;
  url: string;
  posted_at?: string;
  ends_at?: string;
  first_seen?: string;
  score: number;
  tags?: string[];
  matched?: string[];
  reasons?: string[];
  remote?: boolean;
  state_owned?: boolean;
  vendor?: boolean;
};

export type JobDetail = JobSummary & {
  external_id?: string;
  description: string;
};

export type JobsFeed = {
  jobs: JobSummary[];
  updated_at?: string;
  city?: string;
  keywords?: string[];
  sources?: string[];
  counts?: {
    total?: number;
    new_24h?: number;
    chengdu?: number;
    remote?: number;
    state_owned?: number;
    vendor?: number;
  };
};

export type IntelItem = {
  id: string;
  kind: "article" | "vuln";
  source: string;
  title: string;
  summary?: string;
  url: string;
  published_at?: string;
  first_seen?: string;
  cve?: string;
  cvss?: number;
  severity?: string;
  vendor?: string;
  product?: string;
  exploited?: boolean;
  tags?: string[];
};

export type IntelSource = { key: string; label: string };

export type IntelResponse = {
  items: IntelItem[];
  sources?: IntelSource[];
  updated_at?: string;
  refresh_minutes?: number;
  counts?: {
    total?: number;
    articles?: number;
    vulns?: number;
    new_24h?: number;
    exploited?: number;
  };
};

export type Confirmation = {
  confirmation_id: string;
  summary: string;
  status?: string;
  expires_at?: string;
};

export type ConductorReply = {
  reply: string;
  confirmations?: Confirmation[];
};

export type StoredMessage = {
  id: number;
  role: string;
  content: string;
  created_at?: string;
};

export type PairResult = {
  token: string;
  device_id: string;
  device_name?: string;
};
