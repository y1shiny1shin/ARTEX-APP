import type { Findings, Task } from "../types";
import { palette, type Tone } from "../theme";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  return new Date(time).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function clockTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function shortDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.getFullYear() !== now.getFullYear()) {
    return date.toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function isWithinHours(value: string | undefined, hours: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= hours * HOUR;
}

export function taskStatusMeta(task: Pick<Task, "status" | "paused">): { label: string; tone: Tone } {
  if (task.paused) return { label: "已暂停", tone: "amber" };
  switch (task.status) {
    case "running":
      return { label: "运行中", tone: "green" };
    case "done":
    case "completed":
      return { label: "已完成", tone: "accent" };
    case "failed":
      return { label: "失败", tone: "red" };
    case "timeout":
      return { label: "超时", tone: "red" };
    case "stopped":
      return { label: "已停止", tone: "muted" };
    case "queued":
    case "pending":
      return { label: "排队中", tone: "violet" };
    default:
      return { label: task.status || "未知", tone: "muted" };
  }
}

export function intentStateMeta(state: string): { label: string; tone: Tone } {
  switch (state) {
    case "running":
      return { label: "进行中", tone: "green" };
    case "done":
    case "completed":
      return { label: "完成", tone: "accent" };
    case "failed":
      return { label: "失败", tone: "red" };
    case "pending":
    case "open":
      return { label: "待处理", tone: "violet" };
    case "paused":
      return { label: "暂停", tone: "amber" };
    default:
      return { label: state || "未知", tone: "muted" };
  }
}

export function findingTone(severity: "critical" | "high" | "medium" | "low"): Tone {
  switch (severity) {
    case "critical":
    case "high":
      return "red";
    case "medium":
      return "amber";
    default:
      return "cyan";
  }
}

export function findingsOf(task: Task): Findings {
  return task.distinct_findings ?? task.findings ?? {};
}

export function totalFindings(task: Task): number {
  const findings = findingsOf(task);
  return (
    findings.total ??
    (findings.critical ?? 0) + (findings.high ?? 0) + (findings.medium ?? 0) + (findings.low ?? 0)
  );
}

export function goalPercent(task: Task): number {
  const total = task.goals_total ?? 0;
  const met = task.goals_met ?? 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, met / total));
}

export function initials(value: string): string {
  const clean = value.trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s_\-./]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [palette.accent, palette.cyan, palette.green, palette.violet, palette.pink, palette.amber];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const LANGUAGE_COLORS: Record<string, string> = {
  Go: "#00ADD8",
  Python: "#3572A5",
  TypeScript: "#3178C6",
  JavaScript: "#F1E05A",
  Rust: "#DEA584",
  C: "#555555",
  "C++": "#F34B7D",
  CSharp: "#178600",
  Java: "#B07219",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Shell: "#89E051",
  HTML: "#E34C26",
  Dockerfile: "#384D54",
};

export function languageColor(language?: string): string {
  if (!language) return palette.muted;
  return LANGUAGE_COLORS[language] ?? palette.cyan;
}

export function compactNumber(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

export function splitRepo(fullName: string): { owner: string; name: string } {
  const index = fullName.indexOf("/");
  if (index < 0) return { owner: "", name: fullName };
  return { owner: fullName.slice(0, index), name: fullName.slice(index + 1) };
}

export function eventLabel(type?: string): string {
  switch (type) {
    case "PushEvent":
      return "PUSH";
    case "WatchEvent":
      return "STAR";
    case "ForkEvent":
      return "FORK";
    case "CreateEvent":
      return "CREATE";
    case "ReleaseEvent":
      return "RELEASE";
    case "PullRequestEvent":
      return "PR";
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent":
      return "REVIEW";
    case "IssuesEvent":
      return "ISSUE";
    case "IssueCommentEvent":
    case "CommitCommentEvent":
      return "COMMENT";
    case "PublicEvent":
      return "PUBLIC";
    case "DeleteEvent":
      return "DELETE";
    case "MemberEvent":
      return "MEMBER";
    case "GollumEvent":
      return "WIKI";
    case undefined:
    case "":
      return "EVENT";
    default:
      return type.replace(/Event$/, "").toUpperCase();
  }
}

export function formatMinutes(minutes?: number): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} 天`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}
