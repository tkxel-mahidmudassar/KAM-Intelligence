"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, XCircle, DollarSign,
  ClipboardList, ArrowRight, Activity, TrendingUp, TrendingDown,
  Minus, CalendarClock, Sparkles, ExternalLink, Check,
} from "lucide-react";
import { useRole } from "@/context/RoleContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { CalendarView } from "@/components/home/CalendarView";
import { cn } from "@/lib/utils";

// Types

type CardKind = "arr" | "healthy" | "atRisk" | "critical" | "actions";
type Health = "HEALTHY" | "AT_RISK" | "CRITICAL";
type ActionStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";
type ActionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Signal {
  id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  description?: string | null;
  isResolved: boolean;
  pendingReview: boolean;
  detectedAt: string;
}

interface Score {
  overall: number;
  csat?: number | null;
  relationship?: number | null;
  risk?: number | null;
  contractHealth?: number | null;
  projectHealth?: number | null;
  resourceHealth?: number | null;
  financial?: number | null;
  whitespace?: number | null;
  computedAt?: string;
}

interface Account {
  id: string;
  name: string;
  industry: string | null;
  arr: number;
  health: Health;
  contractStart?: string | null;
  contractEnd: string | null;
  kamScores: Score[];
  signals: Signal[];
  _count: { actions: number; documents?: number };
}

interface ActionItem {
  id: string;
  accountId: string;
  ownerId?: string | null;
  title: string;
  description?: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  source?: "AI_PROPOSED" | "HUMAN_CREATED";
  dueDate?: string | null;
  createdAt: string;
  account?: { id: string; name: string; health: Health };
}

interface ActivityLog {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  createdAt: string;
  account?: { id: string; name: string } | null;
  user?: { id: string; name: string; role: string } | null;
}

interface SuggestedAction {
  accountId: string;
  accountName: string;
  title: string;
  description: string;
  priority: ActionPriority;
  dueDate: string;
  sourceLabel: string;
}

interface CorrectiveMeasure {
  accountId?: string;
  title: string;
  detail: string;
  sourceLabel: string;
  severity: "Critical" | "High" | "Medium" | "Low";
}

// Helpers

function formatARR(arr: number) {
  if (arr >= 1_000_000) return `$${(arr / 1_000_000).toFixed(1)}M`;
  if (arr >= 1_000) return `$${(arr / 1_000).toFixed(0)}K`;
  return `$${arr}`;
}

function formatDate(isoDate: string | null | undefined) {
  if (!isoDate) return "No date";
  return new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 864e5);
}

function dateFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function humanizeActivity(action: string) {
  return action
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" - ");
}

function isActiveAction(action: ActionItem) {
  return action.status !== "DONE" && action.status !== "DISMISSED";
}

function isOverdue(action: ActionItem) {
  return Boolean(action.dueDate && daysUntil(action.dueDate) !== null && daysUntil(action.dueDate)! < 0);
}

function healthLabel(health: Health) {
  if (health === "HEALTHY") return "Healthy";
  if (health === "AT_RISK") return "At Risk";
  return "Critical";
}

function healthVariant(health: Health) {
  if (health === "HEALTHY") return "healthy" as const;
  if (health === "AT_RISK") return "at-risk" as const;
  return "critical" as const;
}

function priorityVariant(priority: ActionPriority) {
  if (priority === "CRITICAL") return "priority-critical" as const;
  if (priority === "HIGH") return "priority-high" as const;
  if (priority === "MEDIUM") return "priority-medium" as const;
  return "priority-low" as const;
}

function scoreTrend(account: Account) {
  const [latest, previous] = account.kamScores;
  if (!latest) return { value: null, delta: null, label: "No score", tone: "neutral" as const };
  if (!previous) return { value: latest.overall, delta: null, label: "No prior score", tone: "neutral" as const };
  const delta = Math.round(latest.overall - previous.overall);
  return {
    value: latest.overall,
    delta,
    label: delta > 0 ? `+${delta} pts` : delta < 0 ? `${delta} pts` : "Flat",
    tone: delta > 1 ? "up" as const : delta < -1 ? "down" as const : "neutral" as const,
  };
}

function weakestDimension(score?: Score) {
  if (!score) return null;
  const dimensions = [
    ["CSAT", score.csat],
    ["Relationship", score.relationship],
    ["Risk", score.risk],
    ["Contract", score.contractHealth],
    ["Project", score.projectHealth],
    ["Resource", score.resourceHealth],
    ["Financial", score.financial],
    ["Whitespace", score.whitespace],
  ] as const;
  const valid = dimensions.filter(([, value]) => typeof value === "number") as Array<[string, number]>;
  if (!valid.length) return null;
  return valid.sort((a, b) => a[1] - b[1])[0];
}

function attentionLevel(account: Account, actions: ActionItem[]) {
  const renewal = daysUntil(account.contractEnd);
  const hasCriticalSignal = account.signals.some((s) => !s.isResolved && s.severity === "CRITICAL");
  const hasWarningSignal = account.signals.some((s) => !s.isResolved && s.severity === "WARNING");
  const overdueHighAction = actions.some((a) => isOverdue(a) && (a.priority === "HIGH" || a.priority === "CRITICAL"));

  if (account.health === "CRITICAL" || hasCriticalSignal || overdueHighAction || (renewal !== null && renewal <= 30)) {
    return { label: "Critical", variant: "critical" as const, rank: 0 };
  }
  if (account.health === "AT_RISK" || hasWarningSignal || (renewal !== null && renewal <= 60)) {
    return { label: "High", variant: "at-risk" as const, rank: 1 };
  }
  if (actions.some((a) => daysUntil(a.dueDate) !== null && daysUntil(a.dueDate)! <= 7)) {
    return { label: "Medium", variant: "priority-medium" as const, rank: 2 };
  }
  return { label: "Low", variant: "neutral" as const, rank: 3 };
}

function recommendationBundle(account: Account, actions: ActionItem[]) {
  const measures: CorrectiveMeasure[] = [];
  const suggestions: SuggestedAction[] = [];
  const renewal = daysUntil(account.contractEnd);
  const activeSignals = account.signals.filter((s) => !s.isResolved);
  const criticalSignals = activeSignals.filter((s) => s.severity === "CRITICAL");
  const warningSignals = activeSignals.filter((s) => s.severity === "WARNING");
  const overdueActions = actions.filter(isOverdue);
  const weak = weakestDimension(account.kamScores[0]);

  if (account.health === "CRITICAL") {
    measures.push({
      accountId: account.id,
      title: "Start recovery motion",
      detail: "Treat this account as an active recovery case: confirm owner, client sponsor, current blocker, and the next dated commitment.",
      sourceLabel: "Internal health status",
      severity: "Critical",
    });
    suggestions.push({
      accountId: account.id,
      accountName: account.name,
      title: `Run recovery review for ${account.name}`,
      description: "Confirm root cause, client owner, internal owner, deadline, and next client communication.",
      priority: "CRITICAL",
      dueDate: dateFromNow(2),
      sourceLabel: "Internal health status",
    });
  }

  if (account.health === "AT_RISK") {
    measures.push({
      accountId: account.id,
      title: "Stabilize the risk driver",
      detail: "Review the latest score movement, open signals, and overdue work before the next client touchpoint.",
      sourceLabel: "Internal risk status",
      severity: "High",
    });
    suggestions.push({
      accountId: account.id,
      accountName: account.name,
      title: `Create stabilization plan for ${account.name}`,
      description: "List the top risk driver, corrective owner, and next client-facing checkpoint.",
      priority: "HIGH",
      dueDate: dateFromNow(5),
      sourceLabel: "Internal risk status",
    });
  }

  if (criticalSignals.length > 0 || warningSignals.length > 0) {
    const signal = criticalSignals[0] ?? warningSignals[0];
    measures.push({
      accountId: account.id,
      title: "Resolve active signal",
      detail: signal.title,
      sourceLabel: `${signal.severity.toLowerCase()} signal`,
      severity: signal.severity === "CRITICAL" ? "Critical" : "High",
    });
    suggestions.push({
      accountId: account.id,
      accountName: account.name,
      title: `Triage signal: ${signal.title}`,
      description: "Validate the signal, record the corrective owner, and close or escalate it with a dated next step.",
      priority: signal.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
      dueDate: dateFromNow(signal.severity === "CRITICAL" ? 1 : 3),
      sourceLabel: "Internal signal",
    });
  }

  if (renewal !== null && renewal <= 60) {
    measures.push({
      accountId: account.id,
      title: "Prepare renewal path",
      detail: renewal <= 0 ? "Renewal is past due. Confirm commercial status immediately." : `${renewal} days remain before renewal.`,
      sourceLabel: "Contract timeline",
      severity: renewal <= 30 ? "Critical" : "High",
    });
    suggestions.push({
      accountId: account.id,
      accountName: account.name,
      title: `Prepare renewal brief for ${account.name}`,
      description: "Summarize account health, commercial risk, blockers, sponsor map, and renewal next step.",
      priority: renewal <= 30 ? "CRITICAL" : "HIGH",
      dueDate: dateFromNow(Math.max(1, Math.min(7, renewal - 14))),
      sourceLabel: "Contract timeline",
    });
  }

  if (overdueActions.length > 0) {
    measures.push({
      accountId: account.id,
      title: "Clear overdue work",
      detail: `${overdueActions.length} action${overdueActions.length === 1 ? "" : "s"} overdue. Reconfirm owner and due date.`,
      sourceLabel: "Action board",
      severity: "High",
    });
    suggestions.push({
      accountId: account.id,
      accountName: account.name,
      title: `Escalate overdue actions for ${account.name}`,
      description: "Review overdue actions, reset due dates, and escalate blocked items.",
      priority: "HIGH",
      dueDate: dateFromNow(1),
      sourceLabel: "Action board",
    });
  }

  if (weak && weak[1] < 60) {
    measures.push({
      accountId: account.id,
      title: `Improve ${weak[0]} score`,
      detail: `${weak[0]} is the weakest current dimension at ${Math.round(weak[1])}/100.`,
      sourceLabel: "KAM score",
      severity: weak[1] < 45 ? "Critical" : "Medium",
    });
  }

  if (account.health === "HEALTHY" && account.arr >= 500_000) {
    measures.push({
      accountId: account.id,
      title: "Protect and expand",
      detail: "Keep relationship cadence high and look for whitespace without disrupting delivery momentum.",
      sourceLabel: "Portfolio rule",
      severity: "Low",
    });
    suggestions.push({
      accountId: account.id,
      accountName: account.name,
      title: `Schedule growth check-in for ${account.name}`,
      description: "Review stakeholder goals, upcoming roadmap, and expansion fit while the account is healthy.",
      priority: "MEDIUM",
      dueDate: dateFromNow(14),
      sourceLabel: "Portfolio rule",
    });
  }

  if (measures.length === 0) {
    measures.push({
      accountId: account.id,
      title: "No corrective action required",
      detail: "Internal data does not show an urgent corrective measure for this account.",
      sourceLabel: "Internal rules",
      severity: "Low",
    });
  }

  return { measures, suggestions };
}

const HEALTH_ORDER: Record<Health, number> = { CRITICAL: 0, AT_RISK: 1, HEALTHY: 2 };
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

const SEVERITY_CONFIG = {
  CRITICAL: { variant: "critical" as const, label: "Critical" },
  WARNING: { variant: "at-risk" as const, label: "Warning" },
  INFO: { variant: "neutral" as const, label: "Info" },
};

// Rows and panels

function TrendPill({ account }: { account: Account }) {
  const trend = scoreTrend(account);
  const Icon = trend.tone === "up" ? TrendingUp : trend.tone === "down" ? TrendingDown : Minus;
  const color = trend.tone === "up" ? "#22C55E" : trend.tone === "down" ? "#EF4444" : "var(--text-muted)";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>
      <Icon className="h-3 w-3" />
      {trend.value === null ? trend.label : `${Math.round(trend.value)} (${trend.label})`}
    </span>
  );
}

function WatchlistRow({ account }: { account: Account }) {
  const score = account.kamScores[0]?.overall ?? null;
  const renewal = daysUntil(account.contractEnd);
  const scoreColor =
    score === null ? "text-[var(--text-muted)]"
    : score >= 70 ? "text-[#22C55E]"
    : score >= 45 ? "text-[#F59E0B]"
    : "text-[#EF4444]";

  return (
    <Link
      href={`/accounts/${account.id}`}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-surface-2)] transition-colors group"
    >
      <div className="shrink-0">
        <Badge variant={healthVariant(account.health)}>{healthLabel(account.health)}</Badge>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{account.name}</p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {formatARR(account.arr)} ARR
          {renewal !== null && ` - ${renewal > 0 ? `${renewal}d to renewal` : "Renewal past due"}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] text-[var(--text-muted)] leading-none mb-0.5">Score</p>
        <p className={cn("text-[16px] font-bold tabular-nums leading-none", scoreColor)}>
          {score !== null ? Math.round(score) : "-"}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

function SignalRow({ signal, accountName, accountId }: { signal: Signal; accountName: string; accountId: string }) {
  const cfg = SEVERITY_CONFIG[signal.severity] ?? SEVERITY_CONFIG.INFO;
  return (
    <Link
      href={`/accounts/${accountId}`}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--bg-surface-2)] transition-colors group"
    >
      <div className="shrink-0 pt-0.5">
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug truncate">{signal.title}</p>
        <p className="text-[11px] text-[var(--text-muted)] truncate">{accountName}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
    </Link>
  );
}

function AccountBreakdownRow({ account, actions }: { account: Account; actions: ActionItem[] }) {
  const renewal = daysUntil(account.contractEnd);
  const attention = attentionLevel(account, actions);
  const openCount = actions.filter(isActiveAction).length;

  return (
    <Link
      href={`/accounts/${account.id}`}
      className="block rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-3 hover:border-[#0755E9]/40 hover:bg-[var(--bg-surface-2)] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{account.name}</p>
            <Badge variant={healthVariant(account.health)}>{healthLabel(account.health)}</Badge>
            <Badge variant={attention.variant}>{attention.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
            <span>{formatARR(account.arr)} ARR</span>
            <span>{renewal === null ? "No renewal date" : renewal > 0 ? `${renewal}d to renewal` : "Renewal past due"}</span>
            <span>{openCount} active action{openCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <TrendPill account={account} />
          <p className="mt-1 text-[10px] text-[var(--text-disabled)]">View account</p>
        </div>
      </div>
    </Link>
  );
}

function ActionBreakdownRow({ action }: { action: ActionItem }) {
  const due = daysUntil(action.dueDate);
  return (
    <Link
      href={`/accounts/${action.accountId}`}
      className="block rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-3 hover:border-[#0755E9]/40 hover:bg-[var(--bg-surface-2)] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{action.title}</p>
            <Badge variant={priorityVariant(action.priority)}>{action.priority}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)] truncate">{action.account?.name ?? "Account"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("text-[11px] font-semibold", due !== null && due < 0 ? "text-[#EF4444]" : "text-[var(--text-primary)]")}>
            {action.dueDate ? formatDate(action.dueDate) : "No due date"}
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-disabled)]">
            {due === null ? "Unscheduled" : due < 0 ? `${Math.abs(due)}d overdue` : due === 0 ? "Due today" : `Due in ${due}d`}
          </p>
        </div>
      </div>
    </Link>
  );
}

function RecentActivityPanel({ logs, actions }: { logs: ActivityLog[]; actions: ActionItem[] }) {
  const priorityOrder: Record<ActionPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const actionItems = actions
    .filter(isActiveAction)
    .sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return (daysUntil(a.dueDate) ?? 9999) - (daysUntil(b.dueDate) ?? 9999);
    })
    .slice(0, 8)
    .map((action) => ({
      id: `action-${action.id}`,
      title: action.title,
      subtitle: action.account?.name ?? "Account action",
      date: action.dueDate ?? action.createdAt,
      href: `/accounts/${action.accountId}`,
      badge: action.priority,
      badgeVariant: priorityVariant(action.priority),
      kind: "Action",
    }));

  const logItems = logs.slice(0, 8).map((log) => ({
    id: `log-${log.id}`,
    title: humanizeActivity(log.action),
    subtitle: log.account?.name ?? log.entity ?? "System activity",
    date: log.createdAt,
    href: log.account?.id ? `/accounts/${log.account.id}` : "/audit",
    badge: log.entity ?? "Activity",
    badgeVariant: "neutral" as const,
    kind: "Activity",
  }));

  const items = [
    ...actionItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    ...logItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  ].slice(0, 10);

  return (
    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[#14B8A6]" />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">Recent Activity</span>
        </div>
        <Link href="/actions" className="text-[11px] text-[#0755E9] font-medium hover:underline">
          Actions
        </Link>
      </div>
      <div className="px-3 py-3 space-y-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-7 text-[var(--text-muted)]">
            <Activity className="h-8 w-8 mb-2 text-[#14B8A6]" />
            <p className="text-[13px]">No activity yet</p>
          </div>
        ) : (
          items.map((item, index) => (
            <Link key={item.id} href={item.href} className="grid grid-cols-[16px_1fr] gap-2 group">
              <div className="relative flex justify-center">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-[#14B8A6]" />
                {index < items.length - 1 && <span className="absolute top-4 bottom-[-18px] w-px bg-[var(--border-subtle)]" />}
              </div>
              <div className="min-w-0 rounded-lg px-2 py-1.5 group-hover:bg-[var(--bg-surface-2)] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{item.title}</p>
                  <Badge variant={item.badgeVariant} className="shrink-0">{item.kind}</Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{item.subtitle}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-disabled)]">{formatDate(item.date)}</p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function HomepageCommandModal({
  card,
  accounts,
  actions,
  onClose,
  onCreateAction,
  createdKeys,
  creatingKey,
}: {
  card: CardKind | null;
  accounts: Account[];
  actions: ActionItem[];
  onClose: () => void;
  onCreateAction: (suggestion: SuggestedAction) => void;
  createdKeys: Set<string>;
  creatingKey: string | null;
}) {
  const open = card !== null;
  const activeActions = actions.filter(isActiveAction);

  const cardAccounts = useMemo(() => {
    if (card === "healthy") return accounts.filter((a) => a.health === "HEALTHY");
    if (card === "atRisk") return accounts.filter((a) => a.health === "AT_RISK");
    if (card === "critical") return accounts.filter((a) => a.health === "CRITICAL");
    return [...accounts];
  }, [accounts, card]);

  const selectedAccounts = [...cardAccounts].sort((a, b) => {
    const aAttention = attentionLevel(a, activeActions.filter((action) => action.accountId === a.id)).rank;
    const bAttention = attentionLevel(b, activeActions.filter((action) => action.accountId === b.id)).rank;
    if (aAttention !== bAttention) return aAttention - bAttention;
    if (card === "arr") return b.arr - a.arr;
    return HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
  });

  const selectedActions = card === "actions"
    ? [...activeActions].sort((a, b) => {
        const priorityOrder: Record<ActionPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        const p = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (p !== 0) return p;
        return (daysUntil(a.dueDate) ?? 9999) - (daysUntil(b.dueDate) ?? 9999);
      })
    : [];

  const measures = selectedAccounts
    .flatMap((account) => recommendationBundle(account, activeActions.filter((a) => a.accountId === account.id)).measures)
    .sort((a, b) => ["Critical", "High", "Medium", "Low"].indexOf(a.severity) - ["Critical", "High", "Medium", "Low"].indexOf(b.severity))
    .slice(0, 8);

  const suggestions = selectedAccounts
    .flatMap((account) => recommendationBundle(account, activeActions.filter((a) => a.accountId === account.id)).suggestions)
    .filter((suggestion, index, list) => list.findIndex((s) => s.accountId === suggestion.accountId && s.title === suggestion.title) === index)
    .slice(0, 8);

  const titleMap: Record<CardKind, string> = {
    arr: "ARR Breakdown",
    healthy: "Healthy Accounts",
    atRisk: "At-Risk Accounts",
    critical: "Critical Accounts",
    actions: "Open Actions",
  };

  const descriptionMap: Record<CardKind, string> = {
    arr: "Informational account revenue view with renewal exposure and trend context.",
    healthy: "Healthy accounts with trend, renewal, and growth protection context.",
    atRisk: "Accounts requiring stabilization based on internal health, signals, actions, and renewal timing.",
    critical: "Highest-priority accounts with corrective measures and approval-ready suggested actions.",
    actions: "Active actions sorted by priority and due date.",
  };

  if (!card) return null;

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
      title={titleMap[card]}
      description={descriptionMap[card]}
      size="2xl"
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {card === "actions" ? "Action Breakdown" : "Account Breakdown"}
              </p>
              <span className="text-[11px] text-[var(--text-disabled)]">
                {card === "actions" ? `${selectedActions.length} active` : `${selectedAccounts.length} account${selectedAccounts.length === 1 ? "" : "s"}`}
              </span>
            </div>

            {card === "actions" ? (
              selectedActions.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5 text-center text-[13px] text-[var(--text-muted)]">
                  No active actions in this view.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedActions.map((action) => <ActionBreakdownRow key={action.id} action={action} />)}
                </div>
              )
            ) : selectedAccounts.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5 text-center text-[13px] text-[var(--text-muted)]">
                No accounts match this card.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedAccounts.map((account) => (
                  <AccountBreakdownRow
                    key={account.id}
                    account={account}
                    actions={activeActions.filter((action) => action.accountId === account.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">Corrective Measures</p>
              </div>
              <div className="space-y-3">
                {measures.map((measure, index) => (
                  <div key={`${measure.title}-${index}`} className="rounded-lg bg-[var(--bg-surface-2)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-[var(--text-primary)]">{measure.title}</p>
                      <Badge variant={measure.severity === "Critical" ? "critical" : measure.severity === "High" ? "at-risk" : "neutral"}>
                        {measure.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{measure.detail}</p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-disabled)]">
                      Source: {measure.sourceLabel}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-[#7C3AED]" />
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">Suggested Actions</p>
              </div>
              {suggestions.length === 0 ? (
                <p className="text-[12px] text-[var(--text-muted)]">No action suggestions needed from internal rules.</p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((suggestion) => {
                    const key = `${suggestion.accountId}:${suggestion.title}`;
                    const created = createdKeys.has(key);
                    return (
                      <div key={key} className="rounded-lg bg-[var(--bg-surface-2)] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[var(--text-primary)]">{suggestion.title}</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{suggestion.description}</p>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <Badge variant={priorityVariant(suggestion.priority)}>{suggestion.priority}</Badge>
                              <span className="text-[10px] text-[var(--text-disabled)]">Due {formatDate(suggestion.dueDate)}</span>
                              <span className="text-[10px] text-[var(--text-disabled)]">Source: {suggestion.sourceLabel}</span>
                            </div>
                          </div>
                          <Button
                            size="xs"
                            variant={created ? "success" : "primary"}
                            onClick={() => onCreateAction(suggestion)}
                            disabled={created}
                            loading={creatingKey === key}
                            className="shrink-0"
                          >
                            {created ? <Check className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
                            {created ? "Created" : "Approve"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Page

export default function HomePage() {
  const { role, userId } = useRole();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [selectedCard, setSelectedCard] = useState<CardKind | null>(null);
  const [createdSuggestionKeys, setCreatedSuggestionKeys] = useState<Set<string>>(new Set());
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = { "x-role": role };
    if (userId) headers["x-user-id"] = userId;
    return headers;
  }, [role, userId]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [accountsRes, actionsRes, logsRes] = await Promise.all([
        fetch("/api/accounts", { headers }),
        fetch("/api/actions", { headers }),
        fetch("/api/audit?limit=80", { headers }),
      ]);
      const [accountsJson, actionsJson, logsJson] = await Promise.all([
        accountsRes.json(),
        actionsRes.json(),
        logsRes.ok ? logsRes.json() : Promise.resolve({ data: [] }),
      ]);
      setAccounts(accountsJson.data ?? []);
      setActions(actionsJson.data ?? []);
      setActivityLogs(logsJson.data ?? []);
    } catch (err) {
      console.error("[home] dashboard fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const activeActions = actions.filter(isActiveAction);
  const totalOpenActions = activeActions.length;

  const watchlist = [...accounts]
    .sort((a, b) => {
      const hDiff = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
      if (hDiff !== 0) return hDiff;
      const aScore = a.kamScores[0]?.overall ?? 100;
      const bScore = b.kamScores[0]?.overall ?? 100;
      if (aScore !== bScore) return aScore - bScore;
      const aRenewal = daysUntil(a.contractEnd) ?? 9999;
      const bRenewal = daysUntil(b.contractEnd) ?? 9999;
      return aRenewal - bRenewal;
    })
    .slice(0, 5);

  const liveSignals = accounts
    .flatMap((a) =>
      a.signals
        .filter((s) => !s.isResolved && !s.pendingReview)
        .map((s) => ({ signal: s, accountName: a.name, accountId: a.id }))
    )
    .sort((a, b) => SEVERITY_ORDER[a.signal.severity] - SEVERITY_ORDER[b.signal.severity])
    .slice(0, 6);

  const handleCreateSuggestion = useCallback(async (suggestion: SuggestedAction) => {
    const key = `${suggestion.accountId}:${suggestion.title}`;
    setCreatingKey(key);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: suggestion.accountId,
          title: suggestion.title,
          description: `${suggestion.description}\n\nSource: ${suggestion.sourceLabel}`,
          priority: suggestion.priority,
          dueDate: suggestion.dueDate,
          source: "AI_PROPOSED",
          tags: "home-command-center",
        }),
      });
      if (!res.ok) throw new Error("Action creation failed");
      setCreatedSuggestionKeys((prev) => new Set(prev).add(key));
      await fetchDashboard();
    } catch (err) {
      console.error("[home] create suggested action failed:", err);
    } finally {
      setCreatingKey(null);
    }
  }, [authHeaders, fetchDashboard]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--text-primary)]">
          {greeting()}
        </h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5">{todayLabel()}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <PortfolioStatCards
            accounts={accounts}
            openActions={totalOpenActions}
            onSelect={setSelectedCard}
          />
        </div>
      )}

      <CalendarView onItemUpdated={fetchDashboard} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Account Watchlist</span>
            </div>
            <Link href="/portfolio" className="text-[11px] text-[#0755E9] font-medium hover:underline">
              View all
            </Link>
          </div>
          <div className="px-1.5 py-1.5 space-y-0.5">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-[var(--bg-surface-2)] animate-pulse mx-1.5" />
              ))
            ) : watchlist.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
                <CheckCircle2 className="h-8 w-8 mb-2 text-[#22C55E]" />
                <p className="text-[13px]">All accounts healthy</p>
              </div>
            ) : (
              watchlist.map((a) => <WatchlistRow key={a.id} account={a} />)
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)]">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#9333EA]" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">Live Signals</span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">Reviewed & active</span>
          </div>
          <div className="px-1.5 py-1.5 space-y-0.5">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="h-11 rounded-xl bg-[var(--bg-surface-2)] animate-pulse mx-1.5" />
              ))
            ) : liveSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
                <CheckCircle2 className="h-8 w-8 mb-2 text-[#22C55E]" />
                <p className="text-[13px]">No active signals</p>
              </div>
            ) : (
              liveSignals.map(({ signal, accountName, accountId }) => (
                <SignalRow key={signal.id} signal={signal} accountName={accountName} accountId={accountId} />
              ))
            )}
          </div>
        </div>

        <RecentActivityPanel logs={activityLogs} actions={activeActions} />
      </div>

      <HomepageCommandModal
        card={selectedCard}
        accounts={accounts}
        actions={actions}
        onClose={() => setSelectedCard(null)}
        onCreateAction={handleCreateSuggestion}
        createdKeys={createdSuggestionKeys}
        creatingKey={creatingKey}
      />
    </div>
  );
}

function PortfolioStatCards({
  accounts, openActions, onSelect,
}: {
  accounts: Account[];
  openActions: number;
  onSelect: (card: CardKind) => void;
}) {
  const total = accounts.length;
  const healthy = accounts.filter((a) => a.health === "HEALTHY").length;
  const atRisk = accounts.filter((a) => a.health === "AT_RISK").length;
  const critical = accounts.filter((a) => a.health === "CRITICAL").length;
  const totalARR = accounts.reduce((s, a) => s + a.arr, 0);

  const cards = [
    { id: "arr" as const, label: "Total ARR", value: formatARR(totalARR), sub: `${total} account${total !== 1 ? "s" : ""}`, icon: DollarSign, iconBg: "#0755E9" },
    { id: "healthy" as const, label: "Healthy", value: healthy, sub: healthy > 0 ? `${Math.round((healthy / Math.max(total, 1)) * 100)}% of portfolio` : "-", icon: CheckCircle2, iconBg: "#22C55E" },
    { id: "atRisk" as const, label: "At Risk", value: atRisk, sub: atRisk > 0 ? `${formatARR(accounts.filter((a) => a.health === "AT_RISK").reduce((s, a) => s + a.arr, 0))} ARR` : "-", icon: AlertTriangle, iconBg: "#F59E0B" },
    { id: "critical" as const, label: "Critical", value: critical, sub: critical > 0 ? `${formatARR(accounts.filter((a) => a.health === "CRITICAL").reduce((s, a) => s + a.arr, 0))} at risk` : "-", icon: XCircle, iconBg: "#EF4444" },
    { id: "actions" as const, label: "Open Actions", value: openActions, sub: openActions === 1 ? "1 task pending" : `${openActions} tasks pending`, icon: ClipboardList, iconBg: "#7C3AED" },
  ];

  return (
    <>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] shadow-[var(--glass-shadow)] p-4 flex flex-col gap-1.5 text-left hover:border-[#0755E9]/40 hover:bg-[var(--bg-surface-2)] transition-colors group"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-[var(--text-muted)] leading-tight">{card.label}</p>
              <ExternalLink className="h-3 w-3 text-[var(--text-disabled)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-end justify-between gap-1">
              <p className="text-[28px] font-bold text-[var(--text-primary)] leading-none tabular-nums">{card.value}</p>
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mb-0.5"
                style={{ background: `${card.iconBg}20` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: card.iconBg }} />
              </div>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate">{card.sub}</p>
          </button>
        );
      })}
    </>
  );
}
