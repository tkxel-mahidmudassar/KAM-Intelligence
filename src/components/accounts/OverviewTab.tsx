"use client";

import { useState } from "react";
import { TrendingUp, AlertTriangle, Ticket, Users, Activity, Zap, Brain, ChevronRight, CheckCircle2, XCircle, Clock, TrendingDown, Minus, ChevronDown } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, LineChart, Line,
} from "recharts";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { ScoreHistoryChart } from "./ScoreHistoryChart";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  id: string;
  title: string;
  severity: string;
  detectedAt: string;
  isResolved: boolean;
}

interface Action {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  owner: { name: string } | null;
}

interface Insight {
  id: string;
  type: string;
  title: string;
  summary: string;
  confidence: number;
  generatedAt: string;
}

interface KpiDimension {
  id: string;
  name: string;
  category: string;
  value: number;
  target: number | null;
  unit: string | null;
  trend?: string | null;
}

interface AdapterData {
  jira: {
    openTickets: number;
    criticalTickets: number;
    avgResolutionDays: number;
    sprintVelocity: number;
  };
  worksphere: {
    activeUsers: number;
    totalUsers: number;
    utilizationPct: number;
    npsScore: number | null;
    lastMeetingDate: string | null;
  };
  finance: {
    revenueUtilizationPct: number;
    outstandingInvoices: number;
    overdueAmount: number;
  };
}

interface KamScore {
  overall: number;
  csat: number | null;
  relationship: number | null;
  risk: number | null;
  contractHealth: number | null;
  projectHealth: number | null;
  resourceHealth: number | null;
  financial: number | null;
  whitespace: number | null;
  aiNarrative: string | null;
  computedAt: string;
}

export interface ScoreOverride {
  id: string;
  kpiKey: string;
  previousValue: number;
  requestedValue: number;
  approvedValue: number | null;
  reason: string;
  status: string;
  createdAt: string;
  account?: { id: string; name: string; health: string };
}

interface OverviewTabProps {
  signals: Signal[];
  actions: Action[];
  insights: Insight[];
  kpiDimensions: KpiDimension[];
  adapters: AdapterData;
  latestScore: KamScore | null;
  scoreHistory?: KamScore[];           // newest-first array of historical scores
  scoreRefreshKey?: number;
  // Score override props
  scoreOverrides?: ScoreOverride[];
  role?: string;
  accountId?: string;
  onRequestOverride?: (kpiKey: string, requestedValue: number, reason: string) => Promise<void>;
  onApproveOverride?: (overrideId: string) => Promise<void>;
  onDeclineOverride?: (overrideId: string, reason: string) => Promise<void>;
  onWithdrawOverride?: (overrideId: string) => Promise<void>;
}

// ─── KPI definitions (weights for tooltip) ───────────────────────────────────

const KPI_META: { key: keyof KamScore; label: string; weight: number }[] = [
  { key: "csat",           label: "CSAT",             weight: 20 },
  { key: "relationship",   label: "Relationship",      weight: 15 },
  { key: "risk",           label: "Risk",              weight: 15 },
  { key: "contractHealth", label: "Contract Health",   weight: 15 },
  { key: "projectHealth",  label: "Project Health",    weight: 10 },
  { key: "resourceHealth", label: "Resource Health",   weight: 10 },
  { key: "financial",      label: "Financial",         weight: 10 },
  { key: "whitespace",     label: "Whitespace",        weight:  5 },
];

// ─── Radar tooltip ────────────────────────────────────────────────────────────

function RadarTooltip({ active, payload }: { active?: boolean; payload?: { payload: { weight: number; value: number; label: string } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--glass-elevated-border)] bg-[var(--glass-elevated-bg)] px-3 py-2 text-[11px] shadow-lg">
      <p className="font-semibold text-[var(--text-primary)]">{d.label}</p>
      <p className="text-[var(--text-secondary)]">Score: <span className="font-bold">{d.value}</span></p>
      <p className="text-[var(--text-muted)]">Weight: {d.weight}%</p>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${color}20` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums leading-none">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "CRITICAL") return <Badge variant="critical">Critical</Badge>;
  if (severity === "HIGH")     return <Badge variant="at-risk">High</Badge>;
  return <Badge variant="neutral">Medium</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, "priority-critical" | "priority-high" | "priority-medium" | "priority-low"> = {
    CRITICAL: "priority-critical",
    HIGH:     "priority-high",
    MEDIUM:   "priority-medium",
    LOW:      "priority-low",
  };
  return <Badge variant={map[priority] ?? "neutral"}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</Badge>;
}

function scoreColor(v: number) {
  return v >= 70 ? "#22C55E" : v >= 45 ? "#F59E0B" : "#EF4444";
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function insightTypeColor(type: string) {
  const map: Record<string, string> = {
    RISK: "#EF4444", OPPORTUNITY: "#22C55E", RECOMMENDATION: "#0755E9",
    PATTERN: "#F59E0B", ANOMALY: "#8B5CF6",
  };
  return map[type] ?? "#6B7280";
}

// ─── Override Request Modal ────────────────────────────────────────────────────

function OverrideModal({
  kpiKey,
  kpiLabel,
  currentValue,
  onClose,
  onSubmit,
}: {
  kpiKey: string;
  kpiLabel: string;
  currentValue: number;
  onClose: () => void;
  onSubmit: (value: number, reason: string) => Promise<void>;
}) {
  const [value, setValue]   = useState(String(currentValue));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(value);
    if (isNaN(v) || v < 0 || v > 100 || !reason.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(v, reason.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--glass-elevated-border)] shadow-2xl"
        style={{ background: "var(--glass-elevated-bg)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">Request Score Override</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {kpiLabel} — AI computed <span className="font-semibold text-[var(--text-primary)]">{currentValue}</span>
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
              Requested Value (0–100)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0755E9]/40"
              required
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
              Reason for Override
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why the AI score doesn't reflect reality..."
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[#0755E9]/40"
              required
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white bg-[#0755E9] hover:bg-[#0645C4] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Decline Modal ────────────────────────────────────────────────────────────

function DeclineModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--glass-elevated-border)] shadow-2xl"
        style={{ background: "var(--glass-elevated-bg)" }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">Decline Override</p>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional: reason for declining..."
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--modal-input-bg)] px-3 py-2 text-[13px] text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[#EF4444]/40"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Declining..." : "Decline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── KPI→dimension category mapping ──────────────────────────────────────────

const KPI_CATEGORY_MAP: Record<string, string[]> = {
  csat:           ["engagement", "support"],
  relationship:   ["relationship"],
  risk:           ["support"],
  contractHealth: ["financial"],
  projectHealth:  ["engagement"],
  resourceHealth: ["engagement"],
  financial:      ["financial"],
  whitespace:     ["financial"],
};

// ─── KPI Scoring Row (sparkline + expand for tasks) ──────────────────────────

function KpiScoringRow({
  meta, score, history, dimensions, actions, onRequestOverride, canOverride, overrideActive,
}: {
  meta:             { key: string; label: string; weight: number };
  score:            number | null;
  history:          number[];       // oldest→newest, up to 6 values
  dimensions:       KpiDimension[];
  actions:          Action[];
  onRequestOverride?: () => void;
  canOverride:      boolean;
  overrideActive?:  boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const val = score ?? 50;
  const color = val >= 70 ? "#22C55E" : val >= 45 ? "#F59E0B" : "#EF4444";

  // Drift: last 3 values all declining?
  const isDrifting = history.length >= 3
    && history[history.length - 1] < history[history.length - 2]
    && history[history.length - 2] < history[history.length - 3];

  // Sparkline data
  const sparkData = history.map((v, i) => ({ i, v }));

  // Related open actions
  const cats = KPI_CATEGORY_MAP[meta.key] ?? [];
  const relatedActions = actions.filter((a) =>
    a.status !== "DONE" &&
    (cats.some((c) => a.title.toLowerCase().includes(c)) ||
     cats.some((c) => (a as unknown as { description?: string }).description?.toLowerCase().includes(c)))
  ).slice(0, 3);

  return (
    <div className="border-b border-[var(--border-subtle)] last:border-b-0">
      {/* Row */}
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-surface-2)]/60 transition-colors text-left"
      >
        {/* Score dot */}
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />

        {/* Label */}
        <span className="flex-1 text-[12px] font-medium text-[var(--text-primary)]">{meta.label}</span>

        {/* Drift badge */}
        {isDrifting && (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 px-1.5 py-0.5 rounded">
            <TrendingDown className="h-2.5 w-2.5" /> Drift
          </span>
        )}

        {/* Override badge */}
        {overrideActive && (
          <span className="text-[10px] font-semibold text-[#F59E0B] border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-1.5 py-0.5 rounded">
            Override
          </span>
        )}

        {/* Sparkline */}
        {sparkData.length >= 2 && (
          <div className="w-16 h-6 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Score */}
        <span className="w-8 text-right text-[13px] font-bold tabular-nums shrink-0" style={{ color }}>
          {val}
        </span>

        {/* Weight */}
        <span className="w-10 text-right text-[10px] text-[var(--text-disabled)] shrink-0">{meta.weight}%</span>

        {/* Chevron */}
        <ChevronDown className={cn("h-3 w-3 text-[var(--text-muted)] shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      {/* Expand panel */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-[var(--bg-surface-2)]/40 space-y-3">
          {/* KPI dimensions */}
          {dimensions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Data Points</p>
              {dimensions.map((d) => {
                const pct = d.target ? Math.round((d.value / d.target) * 100) : null;
                const dColor = pct == null ? "#6B7280" : pct >= 90 ? "#22C55E" : pct >= 60 ? "#F59E0B" : "#EF4444";
                return (
                  <div key={d.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[var(--text-primary)] truncate">{d.name}</span>
                        <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: dColor }}>
                          {d.value}{d.unit}
                          {d.target ? <span className="text-[var(--text-disabled)] font-normal"> / {d.target}{d.unit}</span> : null}
                        </span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, pct ?? 50)}%`, background: dColor }}
                        />
                      </div>
                    </div>
                    {d.trend === "up"   && <TrendingUp   className="h-3 w-3 shrink-0 text-[#22C55E]" />}
                    {d.trend === "down" && <TrendingDown  className="h-3 w-3 shrink-0 text-[#EF4444]" />}
                    {d.trend === "flat" && <Minus         className="h-3 w-3 shrink-0 text-[var(--text-disabled)]" />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Related actions */}
          {relatedActions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-disabled)]">Related Actions</p>
              {relatedActions.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-[var(--text-disabled)]" />
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-1">{a.title}</p>
                  <span className={cn(
                    "text-[10px] shrink-0 ml-auto",
                    a.priority === "CRITICAL" ? "text-[#EF4444]" :
                    a.priority === "HIGH"     ? "text-[#F59E0B]" : "text-[var(--text-disabled)]"
                  )}>{a.priority}</span>
                </div>
              ))}
            </div>
          )}

          {/* Override button */}
          {canOverride && onRequestOverride && (
            <button
              onClick={onRequestOverride}
              className="text-[11px] font-medium text-[#0755E9] hover:underline"
            >
              Request score override →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OverviewTab({
  signals, actions, insights, kpiDimensions, adapters, latestScore, scoreHistory = [],
  scoreRefreshKey = 0, scoreOverrides = [], role = "KAM", accountId,
  onRequestOverride, onApproveOverride, onDeclineOverride, onWithdrawOverride,
}: OverviewTabProps) {
  const [overrideModal, setOverrideModal] = useState<{ kpiKey: string; kpiLabel: string; currentValue: number } | null>(null);
  const [declineModal, setDeclineModal]   = useState<string | null>(null); // overrideId

  const topSignals = signals.slice(0, 3);
  const topActions = actions.slice(0, 4);
  const topInsights = insights.slice(0, 3);

  // Build per-KPI sparkline history (oldest→newest, up to 6 points)
  const kpiHistory = (key: keyof KamScore): number[] => {
    const vals = [...scoreHistory]
      .reverse()  // scoreHistory is newest-first; reverse to oldest-first
      .slice(-6)
      .map((s) => {
        const v = s[key];
        return typeof v === "number" ? Math.round(v) : null;
      })
      .filter((v): v is number => v !== null);
    if (latestScore) {
      const latest = latestScore[key];
      if (typeof latest === "number") vals.push(Math.round(latest));
    }
    return vals;
  };

  // Drift detection: overall score declining over last 3 points
  const overallHistory = kpiHistory("overall");
  const portfolioDrifting = overallHistory.length >= 3
    && overallHistory[overallHistory.length - 1] < overallHistory[overallHistory.length - 2]
    && overallHistory[overallHistory.length - 2] < overallHistory[overallHistory.length - 3];

  const isKam = role === "KAM";

  return (
    <div className="space-y-4">
      {/* AI Narrative */}
      {latestScore?.aiNarrative && (
        <div
          className="rounded-xl border border-[#0755E9]/20 p-4"
          style={{ background: "linear-gradient(135deg, rgba(7,85,233,0.06) 0%, rgba(7,85,233,0.02) 100%)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-[#0755E9]" />
            <span className="text-[12px] font-semibold text-[#0755E9] uppercase tracking-wider">AI Narrative</span>
            <span className="text-[11px] text-[var(--text-disabled)] ml-auto">
              {timeAgo(latestScore.computedAt)}
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{latestScore.aiNarrative}</p>
        </div>
      )}

      {/* Score history chart */}
      {accountId && <ScoreHistoryChart accountId={accountId} refreshKey={scoreRefreshKey} />}

      {/* Pending override banner — shown to managers/executives */}
      {(role === "MANAGER" || role === "EXECUTIVE") && scoreOverrides.filter((o) => o.status === "PENDING").length > 0 && (
        <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/05 p-4 space-y-2" style={{ background: "rgba(245,158,11,0.05)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-[#F59E0B]" />
            <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Pending Score Overrides
            </p>
          </div>
          {scoreOverrides.filter((o) => o.status === "PENDING").map((o) => {
            const meta = KPI_META.find((m) => m.key === o.kpiKey);
            return (
              <div key={o.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--glass-bg)] px-3 py-2.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                    {meta?.label ?? o.kpiKey}: {o.previousValue} → {o.requestedValue}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-2">{o.reason}</p>
                </div>
                <div className="flex gap-1.5 shrink-0 mt-0.5">
                  <button
                    onClick={() => onApproveOverride?.(o.id)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white bg-[#22C55E] hover:bg-[#16A34A] transition-colors"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </button>
                  <button
                    onClick={() => setDeclineModal(o.id)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] transition-colors"
                  >
                    <XCircle className="h-3 w-3" /> Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Score dimensions + Adapter metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score breakdown — radar chart with clickable labels */}
        {latestScore && (() => {
            const radarData = KPI_META.map((m) => ({
              label:  m.label,
              key:    m.key as string,
              weight: m.weight,
              value:  Math.round((latestScore[m.key] as number | null) ?? 50),
            }));
            const radarColor = latestScore.overall >= 70 ? "#22C55E" : latestScore.overall >= 45 ? "#F59E0B" : "#EF4444";
            const isKam = role === "KAM";

            const handleLabelClick = (entry: { value: string }) => {
              if (!isKam || !onRequestOverride) return;
              const meta = KPI_META.find((m) => m.label === entry.value);
              if (!meta) return;
              const current = Math.round((latestScore[meta.key] as number | null) ?? 50);
              setOverrideModal({ kpiKey: meta.key as string, kpiLabel: meta.label, currentValue: current });
            };

            return (
              <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Score Breakdown
                  </h3>
                  {isKam && onRequestOverride && (
                    <span className="text-[10px] text-[var(--text-muted)] italic">Click a label to request an override</span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis
                      dataKey="label"
                      tick={(props) => {
                        const { x, y, payload } = props as { x: number; y: number; payload: { value: string } };
                        return (
                          <text
                            x={x}
                            y={y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={10}
                            fill={isKam && onRequestOverride ? "#0755E9" : "var(--text-muted)"}
                            style={{ cursor: isKam && onRequestOverride ? "pointer" : "default", userSelect: "none" }}
                            onClick={() => handleLabelClick(payload)}
                          >
                            {payload.value}
                          </text>
                        );
                      }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      dataKey="value"
                      stroke={radarColor}
                      fill={radarColor}
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                    <Tooltip content={<RadarTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

        {/* Adapter metrics */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={Ticket}
              label="Open Tickets"
              value={adapters.jira.openTickets}
              sub={`${adapters.jira.criticalTickets} critical`}
              color="#F59E0B"
            />
            <MetricCard
              icon={Activity}
              label="Utilisation"
              value={`${adapters.worksphere.utilizationPct}%`}
              sub={`${adapters.worksphere.activeUsers}/${adapters.worksphere.totalUsers} users`}
              color="#0755E9"
            />
            <MetricCard
              icon={TrendingUp}
              label="Rev. Utilisation"
              value={`${adapters.finance.revenueUtilizationPct}%`}
              sub={adapters.finance.overdueAmount > 0 ? `$${adapters.finance.overdueAmount.toLocaleString()} overdue` : "No overdue"}
              color={adapters.finance.revenueUtilizationPct >= 80 ? "#22C55E" : "#F59E0B"}
            />
            <MetricCard
              icon={Users}
              label="NPS Score"
              value={adapters.worksphere.npsScore ?? "N/A"}
              sub="Net Promoter"
              color={
                adapters.worksphere.npsScore === null ? "#6B7280" :
                adapters.worksphere.npsScore >= 40 ? "#22C55E" :
                adapters.worksphere.npsScore >= 10 ? "#F59E0B" : "#EF4444"
              }
            />
          </div>
        </div>
      </div>

      {/* ── KPI Scoring Dimensions list ──────────────────────────────────── */}
      {latestScore && (
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              KPI Score Dimensions
            </h3>
            <div className="flex items-center gap-2">
              {portfolioDrifting && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-0.5 rounded-full">
                  <TrendingDown className="h-2.5 w-2.5" /> Score drifting down
                </span>
              )}
              <div className="flex gap-4 text-[10px] text-[var(--text-disabled)]">
                <span>Score</span>
                <span>Weight</span>
              </div>
            </div>
          </div>
          <div>
            {KPI_META.map((m) => {
              const dims = kpiDimensions.filter((d) =>
                (KPI_CATEGORY_MAP[m.key] ?? []).includes(d.category)
              );
              const hasApprovedOverride = scoreOverrides.some(
                (o) => o.kpiKey === m.key && o.status === "APPROVED"
              );
              return (
                <KpiScoringRow
                  key={m.key}
                  meta={m}
                  score={latestScore[m.key as keyof KamScore] as number | null}
                  history={kpiHistory(m.key as keyof KamScore)}
                  dimensions={dims}
                  actions={actions}
                  canOverride={isKam && !!onRequestOverride}
                  overrideActive={hasApprovedOverride}
                  onRequestOverride={onRequestOverride ? () => {
                    const val = latestScore[m.key as keyof KamScore];
                    setOverrideModal({ kpiKey: m.key, kpiLabel: m.label, currentValue: typeof val === "number" ? Math.round(val) : 50 });
                  } : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Signals + Actions + Insights row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Open Signals */}
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Open Signals
            </h3>
            <span className="text-[11px] text-[var(--text-disabled)] bg-[var(--border-subtle)] rounded-full px-2 py-px">
              {signals.length}
            </span>
          </div>
          {topSignals.length === 0 ? (
            <p className="text-[12px] text-[var(--text-disabled)] py-4 text-center">No open signals</p>
          ) : (
            <div className="space-y-2">
              {topSignals.map((s) => (
                <div key={s.id} className="flex items-start gap-2">
                  <Zap
                    className="h-3.5 w-3.5 mt-0.5 shrink-0"
                    style={{ color: s.severity === "CRITICAL" ? "#EF4444" : "#F59E0B" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[var(--text-secondary)] line-clamp-2 leading-snug">{s.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <SeverityBadge severity={s.severity} />
                      <span className="text-[10px] text-[var(--text-disabled)]">{timeAgo(s.detectedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {signals.length > 3 && (
                <button className="text-[11px] text-[#0755E9] flex items-center gap-0.5 hover:underline mt-1">
                  +{signals.length - 3} more <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Open Actions */}
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Open Actions
            </h3>
            <span className="text-[11px] text-[var(--text-disabled)] bg-[var(--border-subtle)] rounded-full px-2 py-px">
              {actions.length}
            </span>
          </div>
          {topActions.length === 0 ? (
            <p className="text-[12px] text-[var(--text-disabled)] py-4 text-center">No open actions</p>
          ) : (
            <div className="space-y-2">
              {topActions.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-[var(--text-secondary)] line-clamp-1 leading-snug">{a.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <PriorityBadge priority={a.priority} />
                      {a.dueDate && (
                        <span className={cn(
                          "text-[10px]",
                          new Date(a.dueDate) < new Date() ? "text-[#EF4444]" : "text-[var(--text-disabled)]"
                        )}>
                          Due {new Date(a.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {actions.length > 4 && (
                <button className="text-[11px] text-[#0755E9] flex items-center gap-0.5 hover:underline mt-1">
                  +{actions.length - 4} more <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* AI Insights */}
        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] [backdrop-filter:var(--glass-blur)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              AI Insights
            </h3>
            <span className="text-[11px] text-[var(--text-disabled)] bg-[var(--border-subtle)] rounded-full px-2 py-px">
              {insights.length}
            </span>
          </div>
          {topInsights.length === 0 ? (
            <p className="text-[12px] text-[var(--text-disabled)] py-4 text-center">No insights yet</p>
          ) : (
            <div className="space-y-3">
              {topInsights.map((ins) => (
                <div key={ins.id} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: insightTypeColor(ins.type) }} />
                    <p className="text-[12px] font-medium text-[var(--text-primary)] line-clamp-1">{ins.title}</p>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 pl-3">{ins.summary}</p>
                  <div className="pl-3 flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-disabled)]">
                      {Math.round(ins.confidence * 100)}% confidence
                    </span>
                    <span className="text-[10px] text-[var(--text-disabled)]">·</span>
                    <span className="text-[10px] text-[var(--text-disabled)]">{timeAgo(ins.generatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Override request modal */}
      {overrideModal && (
        <OverrideModal
          kpiKey={overrideModal.kpiKey}
          kpiLabel={overrideModal.kpiLabel}
          currentValue={overrideModal.currentValue}
          onClose={() => setOverrideModal(null)}
          onSubmit={async (value, reason) => {
            await onRequestOverride?.(overrideModal.kpiKey, value, reason);
          }}
        />
      )}

      {/* Decline modal */}
      {declineModal && (
        <DeclineModal
          onClose={() => setDeclineModal(null)}
          onConfirm={async (reason) => {
            await onDeclineOverride?.(declineModal, reason);
          }}
        />
      )}
    </div>
  );
}
